import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveSkillConfig } from './config.mjs';

export const DEFAULT_RULING_DIR = resolveSkillConfig().rulingDataDir;
export const SNAPSHOT_REPOSITORY = 'coldiceh/ocg-ruling-assistant';
const cache = new Map();
export const digest = value => createHash('sha256').update(value).digest('hex');
const numeric = value => /^\d{1,10}$/.test(String(value));
const officialHost = url => { try { return ['www.yugioh-card.com', 'www.db.yugioh-card.com'].includes(new URL(url).hostname); } catch { return false; } };

export function normalizeSnapshot(payloads) {
  // Negative mirror IDs identify Speed Duel skills, outside the OCG ruleset.
  const cards = payloads.cards.records.filter(card => !(String(card.id).startsWith('-') && (card.type === 'skill' || card.cardType === 'skill'))).map(card => ({
    id: String(card.id), name: card.name, cnName: card.cnName, jaName: card.jaName, enName: card.enName,
    aliases: [...new Set([card.name, card.cnName, card.jaName, card.enName, ...(card.aliases || [])].filter(Boolean))],
    sourceUrl: card.sourceUrl,
  }));
  if (new Set(cards.map(card => card.id)).size !== cards.length) throw new Error('cards duplicate IDs');
  if (cards.some(card => !numeric(card.id) || !card.name)) throw new Error('Invalid card identity');
  const cardById = new Map(cards.map(card => [card.id, card]));
  for (const entry of payloads.bridges?.entries || []) {
    const card = cardById.get(String(entry.cardId));
    // A community Chinese name may bridge to a CID only when the Japanese identity agrees.
    if (card && entry.jaName === card.jaName && typeof entry.name === 'string') card.aliases = [...new Set([...card.aliases, entry.name])];
  }
  const rules = payloads.rules.records.filter(r => r.recordType === 'rule-doc' && !['site-info', 'table-of-contents'].includes(r.sourceRole)).map(r => ({
    id: r.id, recordType: 'rule-doc', title: r.title, text: r.text, sourceUrl: r.sourceUrl,
    sourceName: r.sourceName || 'OCG Rule', updatedAt: r.updatedAt || payloads.rules.generatedAt,
    sourceAuthority: r.id.startsWith('konami:') && officialHost(r.sourceUrl) ? 'official_rulebook_snapshot' : 'community_reference',
    ruleset: /TCG/.test(r.title) ? 'TCG' : 'OCG',
    historical: /2017|规则修订|变更点/.test(r.title),
    sourceLinks: [...new Set((r.structure?.explicitLinks || []).map(x => x.sourceHref).filter(x => /^https?:\/\//.test(x)))],
  }));
  const qa = payloads.qa.records.filter(r => r.recordType === 'qa').map(r => {
    const sourceId = String(r.sourceId || r.id || '').replace(/^ygoresources-qa-/, '');
    const hasCompleteText = Boolean(r.sourceUrl && (r.rawQuestion || r.question) && (r.rawAnswer || r.answer || r.conclusion));
    if (!numeric(sourceId) || !/^ygoresources-qa-\d+$/.test(r.id) || (r.sourceUrl && (!/^https:\/\/db\.ygoresources\.com\/data\/qa\/\d+$/.test(r.sourceUrl) || !r.sourceUrl.endsWith('/' + sourceId)))) throw new Error('Invalid Q&A provenance: ' + r.id);
    return {
      id: 'qa:' + sourceId, sourceId, recordType: 'qa', question: r.rawQuestion || r.question || r.title,
      detailedQuestion: r.rawDetailedQuestion || r.question || '', answer: r.rawAnswer || r.answer || r.conclusion || '',
      hasCompleteText, discoveryText: hasCompleteText ? '' : r.text || '',
      questionLocales: r.questionLocales || {}, language: r.questionLocale || 'ja',
      cardIds: (r.cardIds || []).map(String), sourceUrl: `https://www.db.yugioh-card.com/yugiohdb/faq_search.action?fid=${sourceId}&ope=5&request_locale=ja`,
      mirrorUrl: r.sourceUrl || `https://db.ygoresources.com/data/qa/${sourceId}`, sourceAuthority: hasCompleteText ? 'official_qa_mirror' : 'qa_index_candidate', updatedAt: r.updatedAt || payloads.qa.generatedAt,
    };
  });
  const faq = payloads.faq.records.filter(r => r.recordType === 'card-faq').map(r => {
    const match = /^card-faq-(\d+)-((?:pendulum-)?\d+(?:\.\d+)?)$/.exec(r.id);
    if (!match || !cardById.has(match[1]) || !r.conclusion) throw new Error('Invalid card FAQ: ' + r.id);
    return { id: `faq:${match[1]}:${match[2]}`, recordType: 'card-faq', title: r.title, text: r.conclusion,
      cardIds: [match[1]], sourceAuthority: 'official_card_faq_mirror',
      sourceUrl: `https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=${match[1]}&ope=2&request_locale=ja`,
      mirrorUrl: `https://db.ygoresources.com/data/card/${match[1]}`, updatedAt: r.updatedAt || payloads.faq.generatedAt };
  });
  for (const [name, records, minimum] of [['cards', cards, 10000], ['rules', rules, 20], ['qa', qa, 10000]]) {
    if (records.length < minimum) throw new Error(`${name} snapshot incomplete: ${records.length}`);
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error(`${name} duplicate IDs`);
    if (records.some(r => !r.id || (name !== 'cards' && !(r.text || (r.question && r.answer) || (r.question && r.discoveryText))))) throw new Error(`${name} missing required content`);
  }
  if (faq.length < 1000 || new Set(faq.map(r => r.id)).size !== faq.length) throw new Error('FAQ snapshot incomplete or duplicated');
  return { cards, rules, qa, faq };
}

export async function installRulingSnapshot({ payloads, provenance = {}, directory = DEFAULT_RULING_DIR }) {
  const normalized = normalizeSnapshot(payloads);
  const previous = await loadRulingSnapshot(directory, { verify: true }).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (previous) for (const kind of ['cards', 'rules', 'qa', 'faq']) {
    if (normalized[kind].length < previous[kind].length * 0.75) throw new Error(kind + ' snapshot shrank abnormally; previous snapshot retained');
  }
  const generatedAt = [payloads.cards.generatedAt, payloads.rules.generatedAt, payloads.qa.generatedAt, payloads.faq.generatedAt];
  if (generatedAt.some(value => !Number.isFinite(Date.parse(value)))) throw new Error('Missing or invalid upstream snapshot dates');
  const version = Date.now() + '-' + randomUUID();
  const folder = join(directory, 'snapshots', version);
  await mkdir(folder, { recursive: true });
  const files = {};
  for (const kind of ['cards', 'rules', 'qa', 'faq']) {
    const text = JSON.stringify(normalized[kind]);
    const file = kind + '.json';
    await writeFile(join(folder, file), text);
    files[kind] = { file, sha256: digest(text), count: normalized[kind].length, generatedAt: payloads[kind].generatedAt };
  }
  const manifest = { schemaVersion: 1, version, importedAt: new Date().toISOString(), provenance, files };
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // Verify every file before atomically publishing the pointer; readers never see a partial update.
  await readVersion(directory, version);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, 'current.' + randomUUID() + '.tmp');
  await writeFile(temporary, JSON.stringify({ version }));
  try { await rename(temporary, join(directory, 'current.json')); } finally { await rm(temporary, { force: true }); }
  cache.delete(directory);
  return manifest;
}

async function readVersion(directory, version) {
  if (!/^[0-9]+-[a-f0-9-]+$/.test(version)) throw new Error('Invalid ruling snapshot version');
  const folder = join(directory, 'snapshots', version);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== version) throw new Error('Invalid ruling manifest');
  const result = { manifest };
  for (const kind of ['cards', 'rules', 'qa', 'faq']) {
    const meta = manifest.files[kind];
    if (kind === 'faq' && !meta) { result.faq = []; continue; }
    if (meta.file !== kind + '.json') throw new Error('Invalid snapshot filename');
    const text = await readFile(join(folder, meta.file), 'utf8');
    if (digest(text) !== meta.sha256) throw new Error(kind + ' snapshot integrity check failed');
    result[kind] = JSON.parse(text);
    if (!Array.isArray(result[kind]) || result[kind].length !== meta.count) throw new Error(kind + ' record count mismatch');
  }
  return result;
}

export async function loadRulingSnapshot(directory = DEFAULT_RULING_DIR, { verify = false } = {}) {
  let pointer;
  try { pointer = await readFile(join(directory, 'current.json'), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('Ruling data is not initialized. Run npm run data:init -- --rulings-only.'), { code: 'ENOENT' });
    throw error;
  }
  const { version } = JSON.parse(pointer);
  if (!verify && cache.get(directory)?.manifest.version === version) return cache.get(directory);
  const result = await readVersion(directory, version);
  cache.set(directory, result);
  return result;
}

export function snapshotStatus(snapshot, now = Date.now()) {
  const sources = Object.fromEntries(Object.entries(snapshot.manifest.files).map(([kind, meta]) => {
    const ageDays = Math.max(0, (now - Date.parse(meta.generatedAt)) / 86400000);
    return [kind, { count: meta.count, generatedAt: meta.generatedAt, ageDays: Number(ageDays.toFixed(2)), stale: ageDays > 7 }];
  }));
  return { version: snapshot.manifest.version, importedAt: snapshot.manifest.importedAt, sources, provenance: snapshot.manifest.provenance,
    completeQaCount: snapshot.qa.filter(q => q.hasCompleteText).length,
    qaDiscoveryOnlyCount: snapshot.qa.filter(q => !q.hasCompleteText).length,
    freshnessPolicy: 'Older than 7 days requires rechecking. Fetched/imported time does not reset the upstream source date.' };
}

export async function refreshRulingSources({ allowNetworkUpdate, directory = DEFAULT_RULING_DIR, fetchImpl = fetch } = {}) {
  if (allowNetworkUpdate !== true) throw new Error('An explicitly authorized refresh requires allowNetworkUpdate:true');
  const json = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'Duel Compass-Ruling-Evidence/1.0' } });
    if (!response.ok) throw new Error(`Ruling source fetch failed: ${response.status} ${url}`);
    return response.json();
  };
  const commit = await json(`https://api.github.com/repos/${SNAPSHOT_REPOSITORY}/commits/main`);
  if (!/^[a-f0-9]{40}$/.test(commit.sha || '')) throw new Error('Invalid upstream commit');
  const base = `https://raw.githubusercontent.com/${SNAPSHOT_REPOSITORY}/${commit.sha}/data/`;
  const [cards, rules, qa, faq, bridges] = await Promise.all(['cards.json', 'ocg-rule-corpus.json', 'qa-index.json', 'rulings.json', 'card-nickname-sources/identity-bridges.v1.json'].map(file => json(base + file)));
  return installRulingSnapshot({ directory, payloads: { cards, rules, qa, faq, bridges }, provenance: {
    snapshotRepository: `https://github.com/${SNAPSHOT_REPOSITORY}`, snapshotCommit: commit.sha,
    ruleDocumentation: 'https://github.com/lucays/OCG-Rule-documentation',
    importMethod: 'Commit-pinned upstream evidence snapshot; original per-record URLs retained',
  } });
}
