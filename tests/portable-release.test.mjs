import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSkillConfig } from '../skill/backend/config.mjs';
import { createPersistentEngineServer } from '../skill/backend/persistent-engine-server.mjs';
import { downloadRangedBytes } from '../skill/runtime/src/database/card-data-updater.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('portable data root and explicit legacy overrides agree', () => {
  const config = resolveSkillConfig({ DUEL_COMPASS_DATA_DIR: '/portable-data' });
  assert.ok(config.cardsDbPath.endsWith('cards.cdb'));
  assert.ok(config.rulingDataDir.endsWith('rulings'));
  assert.ok(config.deckSkillDir.includes('portable-data'));
  const legacy = resolveSkillConfig({ DUEL_COMPASS_DATA_DIR: '/portable-data', YGO_CARDS_DB: '/legacy/cards.cdb' });
  assert.ok(legacy.cardsDbPath.includes('legacy'));
});

test('engine rejects public binding and browser requests before starting sessions', async t => {
  assert.throws(() => createPersistentEngineServer({ hostname: '0.0.0.0' }), /loopback/);
  const engine = createPersistentEngineServer();
  await new Promise(resolve => engine.server.listen(0, '127.0.0.1', resolve));
  t.after(() => engine.close());
  const url = `http://127.0.0.1:${engine.server.address().port}`;
  assert.equal((await fetch(url + '/health')).status, 200);
  assert.equal((await fetch(url + '/execute', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/execute', { method: 'POST', body: '{}' })).status, 415);
  assert.equal(engine.host.sessions.size, 0);
});

test('range fallback is complete and rejects changing upstream identity', async () => {
  const data = Buffer.alloc(256 * 1024 + 7, 42);
  const fake = changed => async (url, options) => {
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(a), end = Math.min(Number(b), data.length - 1);
    return new Response(data.subarray(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${data.length}`, ETag: changed && start ? 'different' : 'same' } });
  };
  assert.deepEqual(await downloadRangedBytes('https://example.com/data', { fetchImpl: fake(false), retryCount: 0 }), data);
  await assert.rejects(downloadRangedBytes('https://example.com/data', { fetchImpl: fake(true), retryCount: 0 }), /identity changed/);
});

test('fresh MCP lists all tools and UI without a bundled database', async () => {
  const client = new Client({ name: 'portable-smoke', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.deepEqual(client.getServerVersion(), { name: 'duel-compass', version: '1.4.0-beta.2' });
    assert.equal((await client.listTools()).tools.length, 17);
    assert.ok((await client.listResources()).resources.some(x => x.uri === 'ui://duel-compass/card-lookup-v1.html'));
  } finally { await client.close(); }
});
