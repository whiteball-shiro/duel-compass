import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('fresh MCP exposes ruling tools and returns installed evidence through an isolated engine', { skip: process.env.DUEL_COMPASS_INTEGRATION !== '1', timeout: 45000 }, async () => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const client = new Client({ name: 'ruling-integration-test', version: '1.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))],
    env: { ...process.env, YGO_ENGINE_HOST_PORT: String(port), YGO_MCP_SESSION_ID: 'ruling-test' }, stderr: 'pipe' });
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    const payload = JSON.parse(result.content.find(c => c.type === 'text').text);
    assert.equal(payload.ok, true);
    return payload.result.data;
  };
  let connected = false;
  let started = false;
  try {
    await client.connect(transport);
    connected = true;
    assert.deepEqual(client.getServerVersion(), { name: 'duel-compass', version: '1.4.0-beta.1' });
    const resources = await client.listResources();
    assert.ok(resources.resources.some(resource => resource.uri === 'ui://duel-compass/card-lookup-v1.html'));
    const list = await client.listTools();
    assert.equal(list.tools.length, 17);
    assert.ok(list.tools.some(tool => tool.name === 'queryRulings'));
    assert.ok(list.tools.some(tool => tool.name === 'manageRulingSources'));
    await call('manageEngineSession', { action: 'status' });
    started = true;
    const status = await call('queryRulings', { action: 'status' });
    assert.ok(status.sources.cards.count >= 10000);
    const evidence = await call('queryRulings', { action: 'search', query: '伤害步骤可以发动什么效果？', ruleQueries: ['伤害步骤'], limit: 3 });
    assert.ok(evidence.rules.length);
    assert.ok(evidence.rules.every(rule => !rule.isDirect));
    const full = await call('queryRulings', { action: 'get', evidenceId: evidence.rules[0].sourceRecordId });
    assert.ok(full.text.length > 0);
    const inspected = await call('manageRulingSources', { action: 'inspect' });
    assert.ok(inspected.sources.faq.count >= 1000);
  } finally {
    if (connected && started) await client.callTool({ name: 'manageEngineSession', arguments: { action: 'shutdown', confirm: true } }).catch(() => {});
    await client.close();
  }
});
