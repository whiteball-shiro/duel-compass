import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardImageContents } from '../mcp/card-image-content.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4e8AAAAASUVORK5CYII=', 'base64');
const card = id => ({ id, image: { status: 'available', url: `https://cdn.233.momobako.com/ygoimg/sc/${id}.webp!half` } });
test('MCP embeds real image content in card order instead of text URLs', async () => {
  const response = { ok: true, result: { data: { results: [card(1), card(2)] } } };
  const blocks = await cardImageContents(response, { fetchImpl: async () => new Response(png, { headers: { 'content-type': 'image/png' } }) });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'image');
  assert.equal(blocks[0].mimeType, 'image/png');
  assert.deepEqual(Buffer.from(blocks[0].data, 'base64'), png);
  assert.equal(response.result.data.results[1].image.delivery, 'native-mcp-image');
});
test('network failure preserves card details and reports native delivery failure', async () => {
  const response = { result: { data: { ...card(1), name: 'test card' } } };
  assert.deepEqual(await cardImageContents(response, { fetchImpl: async () => { throw new Error('offline'); } }), []);
  assert.equal(response.result.data.name, 'test card');
  assert.equal(response.result.data.image.delivery, 'unavailable');
  assert.equal(response.result.data.image.deliveryError, 'offline');
});
test('rejects third-party redirects, invalid image bytes and oversized content', async () => {
  for (const reply of [new Response('<html>', { headers: { 'content-type': 'image/png' } }),
    new Response(png, { headers: { 'content-type': 'image/png', 'content-length': '999999' } })]) {
    const response = { result: { data: card(1) } };
    assert.deepEqual(await cardImageContents(response, { fetchImpl: async () => reply }), []);
  }
  let called = false;
  const response = { result: { data: { id: 1, image: { status: 'available', url: 'https://example.com/x' } } } };
  assert.deepEqual(await cardImageContents(response, { fetchImpl: async () => { called = true; } }), []);
  assert.equal(called, false);
});
