import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeSnapshot, installRulingSnapshot, loadRulingSnapshot, refreshRulingSources, snapshotStatus } from '../skill/backend/ruling-sources.mjs';

function payloads() {
  const generatedAt = '2026-10-09T00:00:00.000Z';
  return {
    cards: { generatedAt, records: Array.from({ length: 10000 }, (_, i) => ({ id: String(i + 1), name: '卡片' + i, jaName: '原名' + i })) },
    rules: { generatedAt, records: Array.from({ length: 20 }, (_, i) => ({ id: 'ocg-rule:rule' + i, recordType: 'rule-doc', title: '规则' + i, text: '完整规则文本', sourceUrl: 'https://ocg-rule.readthedocs.io/zh-cn/latest/test.html' })) },
    qa: { generatedAt, records: Array.from({ length: 10000 }, (_, i) => ({ id: 'ygoresources-qa-' + (i + 1), sourceId: String(i + 1), recordType: 'qa', question: '完整问题', answer: '完整回答', sourceUrl: 'https://db.ygoresources.com/data/qa/' + (i + 1), cardIds: ['1'] })) },
    faq: { generatedAt, records: Array.from({ length: 1000 }, (_, i) => ({ id: `card-faq-${i + 1}-1`, recordType: 'card-faq', title: 'FAQ', conclusion: '完整FAQ' })) },
    bridges: { entries: [{ cardId: '1', name: '旧译名', jaName: '原名0' }, { cardId: '2', name: '错误身份', jaName: '不相同的原名' }] },
  };
}

test('name bridges require matching Japanese identity and community pages retain their authority', () => {
  const result = normalizeSnapshot(payloads());
  assert.ok(result.cards[0].aliases.includes('旧译名'));
  assert.ok(!result.cards[1].aliases.includes('错误身份'));
  assert.equal(result.rules[0].sourceAuthority, 'community_reference');
});

test('invalid Q&A provenance and duplicate IDs reject the snapshot', () => {
  const source = payloads();
  source.qa.records[0].sourceUrl = 'https://example.com/data/qa/1';
  assert.throws(() => normalizeSnapshot(source), /provenance/);
  source.qa.records[0].sourceUrl = 'https://db.ygoresources.com/data/qa/1';
  source.cards.records[1].id = source.cards.records[0].id;
  assert.throws(() => normalizeSnapshot(source), /duplicate/);
});

test('OCG import excludes negative Speed Duel skill identities but rejects malformed OCG IDs', () => {
  const source = payloads();
  source.cards.records.push({ id: '-75', name: 'Skill', type: 'skill' });
  assert.equal(normalizeSnapshot(source).cards.length, 10000);
  source.cards.records.push({ id: '-99', name: 'Malformed OCG monster', type: 'monster' });
  assert.throws(() => normalizeSnapshot(source), /Invalid card identity/);
});

test('failed, incomplete or network-failed refresh never replaces a working snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ygo-ruling-test-'));
  try {
    const source = payloads();
    const manifest = await installRulingSnapshot({ payloads: source, directory });
    const pointer = await readFile(join(directory, 'current.json'), 'utf8');
    await assert.rejects(installRulingSnapshot({ payloads: { ...source, rules: { ...source.rules, records: [] } }, directory }), /incomplete/);
    await assert.rejects(refreshRulingSources({ allowNetworkUpdate: true, directory, fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
    await assert.rejects(refreshRulingSources({ directory }), /authorization|authorized/);
    assert.equal(await readFile(join(directory, 'current.json'), 'utf8'), pointer);
    const installed = await loadRulingSnapshot(directory, { verify: true });
    assert.equal(installed.manifest.version, manifest.version);
    assert.equal(installed.qa.length, 10000);
    assert.equal(snapshotStatus(installed, Date.parse('2026-10-20')).sources.qa.stale, true);
    await writeFile(join(directory, 'snapshots', manifest.version, 'rules.json'), '[]');
    await assert.rejects(loadRulingSnapshot(directory, { verify: true }), /integrity/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('update fetches all files at a single validated commit instead of mixing moving branches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ygo-ruling-pinned-'));
  const source = payloads();
  const commit = 'a'.repeat(40);
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    let data;
    if (url.includes('/commits/main')) data = { sha: commit };
    else {
      const suffix = url.split('/data/')[1];
      data = { 'cards.json': source.cards, 'ocg-rule-corpus.json': source.rules, 'qa-index.json': source.qa, 'rulings.json': source.faq, 'card-nickname-sources/identity-bridges.v1.json': source.bridges }[suffix];
      assert.ok(data);
    }
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const manifest = await refreshRulingSources({ directory, allowNetworkUpdate: true, fetchImpl });
    assert.equal(manifest.provenance.snapshotCommit, commit);
    assert.equal(calls.length, 6);
    assert.ok(calls.slice(1).every(url => url.includes('/' + commit + '/')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
