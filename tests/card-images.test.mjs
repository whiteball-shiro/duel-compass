import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachCardImages, createCardImageResolver } from '../skill/backend/card-images.mjs';

test('falls back when simplified Chinese image is missing and never accepts HTML', async () => {
  const urls = [];
  const resolver = createCardImageResolver({ fetchImpl: async (url, options) => {
    assert.equal(options.method, 'HEAD');
    urls.push(url);
    return url.includes('/sc/') ? new Response('', { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response(null, { status: 200, headers: { 'content-type': 'image/webp' } });
  } });
  const image = await resolver(89631139);
  assert.equal(image.status, 'available');
  assert.match(image.url, /\/ygopro\/89631139\.webp!half$/);
  assert.equal(urls.length, 2);
});

test('missing and offline images retain card text and a detail-page fallback', async () => {
  for (const offline of [false, true]) {
    const resolver = createCardImageResolver({ fetchImpl: async () => {
      if (offline) throw new Error('offline');
      return new Response(null, { status: 404 });
    } });
    const result = await attachCardImages({ ok: true, data: { id: 89631139, name: '青眼白龙', effectText: 'original text' } }, { resolver });
    assert.equal(result.data.effectText, 'original text');
    assert.equal(result.data.image.status, offline ? 'unavailable' : 'not-found');
    assert.equal(result.data.imageMarkdown, null);
    assert.equal(result.data.image.cardPageUrl, 'https://ygocdb.com/card/89631139');
  }
});

test('every search result receives its own image and rendering instructions', async () => {
  const resolver = async id => ({ status: 'available', url: `https://example.test/${id}.webp` });
  const result = await attachCardImages({ ok: true, data: { results: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] } }, { resolver });
  assert.equal(result.data.results[0].imageMarkdown, '![A](https://example.test/1.webp)');
  assert.equal(result.data.results[1].imageMarkdown, '![B](https://example.test/2.webp)');
  assert.match(result.data.displayInstructions, /默认同时提供/);
  assert.match(result.data.displayInstructions, /不要自动打开浏览器/);
});

test('identical simultaneous lookups share the same network request', async () => {
  let requests = 0;
  const resolver = createCardImageResolver({ fetchImpl: async () => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(null, { status: 200, headers: { 'content-type': 'image/webp' } });
  } });
  await Promise.all([resolver(89631139), resolver(89631139)]);
  assert.equal(requests, 1);
  assert.equal((await resolver(-1)).status, 'invalid-id');
  assert.equal(requests, 1);
});
