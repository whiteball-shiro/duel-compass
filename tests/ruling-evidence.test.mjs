import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryRulings, resolveRulingCards } from '../skill/backend/ruling-evidence.mjs';
import { loadRulingSnapshot, snapshotStatus } from '../skill/backend/ruling-sources.mjs';
import { validatePublicToolInput, PUBLIC_TOOL_NAMES } from '../skill/backend/tool-schemas.mjs';
import { createModelToolHost } from '../skill/backend/model-tool-host.mjs';
import { getCardEffect } from '../skill/runtime/src/tools/card-tools.js';

const date = '2026-10-09T00:00:00.000Z';
function fixture({ question = '「<<101>>」能发动吗？', complete = true, extraCards = [] } = {}) {
  return {
    manifest: { version: 'fixture', files: Object.fromEntries(['cards', 'rules', 'qa', 'faq'].map(kind => [kind, { count: 1, generatedAt: date }])) },
    cards: [
      { id: '101', name: '测试甲兽', jaName: '甲獣', aliases: ['测试甲兽', '甲獣'] },
      { id: '102', name: '测试乙兽', aliases: ['测试乙兽'] }, ...extraCards,
    ],
    rules: [{ id: 'ocg-rule:test', recordType: 'rule-doc', title: '伤害步骤', text: '伤害步骤\n\n伤害步骤内可以发动的效果需符合相应条件。', sourceUrl: 'https://ocg-rule.readthedocs.io/zh-cn/latest/test.html', sourceAuthority: 'community_reference', ruleset: 'OCG', historical: false, sourceLinks: [] }],
    qa: [{ id: 'qa:12345', sourceId: '12345', recordType: 'qa', question, detailedQuestion: question, answer: complete ? '可以。' : '',
      discoveryText: '这里只是检索线索，不是完整问答。', hasCompleteText: complete, questionLocales: {}, cardIds: ['101'],
      sourceAuthority: complete ? 'official_qa_mirror' : 'qa_index_candidate', sourceUrl: 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action?fid=12345&ope=5&request_locale=ja' }],
    faq: [],
  };
}

test('public schema enforces the input required by each action and exposes both tools', () => {
  assert.ok(PUBLIC_TOOL_NAMES.includes('queryRulings'));
  assert.ok(PUBLIC_TOOL_NAMES.includes('manageRulingSources'));
  assert.equal(validatePublicToolInput('queryRulings', { action: 'search' }).ok, false);
  assert.equal(validatePublicToolInput('queryRulings', { action: 'get' }).ok, false);
  assert.equal(validatePublicToolInput('queryRulings', { action: 'status' }).ok, true);
  assert.equal(validatePublicToolInput('queryRulings', { action: 'search', query: '测试', cardIds: ['101'] }).ok, false);
  assert.equal(validatePublicToolInput('queryRulings', { action: 'search', query: '测试', arbitraryUrl: 'https://example.com' }).ok, false);
});

test('passcodes map through Duel Compass identities, never directly to an official CID', async () => {
  const snapshot = fixture();
  let called;
  const resolved = await resolveRulingCards({ cardIds: [98765432] }, snapshot, async id => { called = id; return { name: '测试甲兽' }; });
  assert.equal(called, 98765432);
  assert.equal(resolved.cards[0].officialCardId, '101');
  assert.equal(resolved.cards[0].passcode, 98765432);
  const missing = await resolveRulingCards({ cardIds: [101] }, snapshot);
  assert.equal(missing.cards.length, 0);
  assert.equal(missing.unresolved.length, 1);
});

test('ambiguous aliases are never silently resolved', async () => {
  const snapshot = fixture({ extraCards: [{ id: '103', name: '同名另一张', aliases: ['测试甲兽'] }] });
  const result = await resolveRulingCards({ cardNames: ['测试甲兽'] }, snapshot);
  assert.equal(result.cards.length, 0);
  assert.equal(result.ambiguous.length, 1);
});

test('exact source question may be a candidate, while near match, extra card and stale snapshot cannot', async () => {
  const snapshot = fixture();
  const input = { action: 'search', query: '「测试甲兽」能发动吗？', cardNames: ['测试甲兽'] };
  const exact = await queryRulings(input, { snapshot, now: Date.parse(date) });
  assert.equal(exact.data.qa[0].isDirect, true);
  assert.equal(exact.data.qa[0].officialWebsiteLiveVerified, false);
  const near = await queryRulings({ ...input, query: input.query + '之后如何处理？' }, { snapshot, now: Date.parse(date) });
  assert.equal(near.data.qa[0].isDirect, false);
  const additional = await queryRulings({ ...input, cardNames: ['测试甲兽', '测试乙兽'] }, { snapshot, now: Date.parse(date) });
  assert.equal(additional.data.qa[0].isDirect, false);
  assert.deepEqual(additional.data.qa[0].missingQuestionCards, ['102']);
  const stale = await queryRulings(input, { snapshot, now: Date.parse(date) + 8 * 86400000 });
  assert.equal(stale.data.qa[0].isDirect, false);
  assert.equal(stale.data.qa[0].stale, true);
});

test('index-only content cannot become an official complete answer', async () => {
  const result = await queryRulings({ action: 'search', query: '「测试甲兽」能发动吗？', cardNames: ['测试甲兽'] }, { snapshot: fixture({ complete: false }), now: Date.parse(date) });
  assert.equal(result.data.qa[0].isDirect, false);
  assert.equal(result.data.qa[0].hasCompleteText, false);
  assert.equal(result.data.qa[0].sourceAuthority, 'qa_index_candidate');
});

test('community passages remain non-official; historical and TCG material are opt-in', async () => {
  const snapshot = fixture();
  snapshot.rules.push({ ...snapshot.rules[0], id: 'ocg-rule:tcg', ruleset: 'TCG' }, { ...snapshot.rules[0], id: 'ocg-rule:old', historical: true });
  const result = await queryRulings({ action: 'search', query: '伤害步骤', ruleQueries: ['伤害步骤'] }, { snapshot, now: Date.parse(date) });
  assert.ok(result.data.rules.length);
  assert.ok(result.data.rules.every(r => !r.official && !r.isDirect && !r.historical && r.ruleset === 'OCG'));
});

test('full source pagination is lossless and unknown evidence IDs do not fabricate citations', async () => {
  const snapshot = fixture();
  snapshot.rules[0].text = '原文'.repeat(200);
  const first = await queryRulings({ action: 'get', evidenceId: 'ocg-rule:test', maxChars: 200 }, { snapshot });
  const second = await queryRulings({ action: 'get', evidenceId: 'ocg-rule:test', offset: first.data.nextOffset, maxChars: 200 }, { snapshot });
  assert.equal(first.data.text + second.data.text, snapshot.rules[0].text);
  assert.equal(second.data.hasMore, false);
  const missing = await queryRulings({ action: 'get', evidenceId: 'invented' }, { snapshot });
  assert.equal(missing.code, 'EVIDENCE_NOT_FOUND');
});

test('live mirror supplies complete evidence and get reads the same live text', async () => {
  const snapshot = fixture({ complete: false });
  const fetchImpl = async url => {
    const data = url.endsWith('/data/meta/mprop') ? [] : /\/data\/card\//.test(url) ? { cardData: { ja: { name: '甲獣' } }, qaIndex: [12345] } : { cards: [101], qaData: { ja: { title: '「<<101>>」能发动吗？', question: '完整场面说明。', answer: '完整实时回答。' } } };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  const result = await queryRulings({ action: 'search', query: '测试甲兽', cardNames: ['测试甲兽'], live: true, limit: 1 }, { snapshot, fetchImpl });
  assert.equal(result.data.qa[0].hasCompleteText, true);
  assert.equal(result.data.qa[0].answer, '完整实时回答。');
  const full = await queryRulings({ action: 'get', evidenceId: 'qa:12345', raw: true }, { snapshot });
  assert.match(full.data.text, /完整实时回答/);
  assert.match(full.data.text, /<<101>>/);
});

test('network failure falls back honestly to local evidence without a fabricated ruling', async () => {
  const result = await queryRulings({ action: 'search', query: '测试甲兽', cardNames: ['测试甲兽'], live: true, limit: 1 }, { snapshot: fixture({ complete: false }), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.data.qa[0].hasCompleteText, false);
  assert.ok(result.data.warnings.some(x => /failed/.test(x)));
});

test('installed real snapshot resolves Chinese name variants and Duel Compass passcodes', { skip: process.env.DUEL_COMPASS_INTEGRATION !== '1' }, async () => {
  const snapshot = await loadRulingSnapshot();
  const result = await resolveRulingCards({ cardNames: ['闭锁世界的冥神'], cardIds: [65741786] }, snapshot, async cardId => getCardEffect({ cardId }).data);
  assert.deepEqual(result.cards.map(c => c.officialCardId).sort(), ['14676', '15741']);
  assert.equal(result.unresolved.length, 0);
  const status = snapshotStatus(snapshot);
  assert.ok(status.sources.rules.count >= 20);
  assert.ok(status.sources.faq.count >= 1000);
  assert.ok(status.qaDiscoveryOnlyCount > 0);
});

test('model host exposes installed evidence and rejects unauthorized refresh', { skip: process.env.DUEL_COMPASS_INTEGRATION !== '1' }, async () => {
  const host = createModelToolHost();
  assert.ok(host.listTools().some(x => x.name === 'queryRulings'));
  const result = await host.execute({ name: 'queryRulings', input: { action: 'search', query: '伤害步骤', ruleQueries: ['伤害步骤'], limit: 2 } });
  assert.equal(result.ok, true);
  assert.equal(result.result.data.rules.length, 2);
  const denied = await host.execute({ name: 'manageRulingSources', input: { action: 'refresh' } });
  assert.equal(denied.ok, false);
  assert.match(denied.result.error, /authorization|authorized/);
});
