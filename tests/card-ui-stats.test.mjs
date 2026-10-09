import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../mcp/card-ui.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function renderCards(cards) {
  const element = () => ({ children: [], textContent: '', append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; } });
  const root = element();
  let handler;
  const parent = { postMessage() {} };
  runInNewContext(script, {
    document: { getElementById: () => root, createElement: element, documentElement: { scrollHeight: 500 } },
    parent, window: { addEventListener: (_name, callback) => { handler = callback; } },
  });
  handler({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { cards } } } });
  const collect = node => [node.textContent, ...node.children.map(collect)].join('\n');
  return root.children.map(collect);
}

test('Link cards display LINK rating and omit arrow mask DEF, while multi-card rendering remains intact', () => {
  const output = renderCards([65741786, 65741787, 65741788, 65741789].map(id => ({ id, type: 'Monster / Effect / Link', level: 2, atk: '800', def: '5' })));
  assert.equal(output.length, 4);
  for (const text of output) {
    assert.match(text, /LINK-2/);
    assert.match(text, /ATK 800/);
    assert.doesNotMatch(text, /2星|DEF/);
  }
});

test('ordinary monsters retain level and DEF; Xyz monsters display rank', () => {
  const [normal, xyz] = renderCards([
    { id: 1, type: 'Monster / Normal', level: 8, atk: '3000', def: '2500' },
    { id: 2, type: 'Monster / Effect / Xyz', level: 4, atk: '?', def: '?' },
  ]);
  assert.match(normal, /8星/);
  assert.match(normal, /ATK 3000 \/ DEF 2500/);
  assert.match(xyz, /阶级 4/);
  assert.doesNotMatch(xyz, /4星/);
  assert.match(xyz, /ATK \? \/ DEF \?/);
});
