import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchCards, getCardEffect, closeSharedCardsDatabase } from '../skill/runtime/src/tools/card-tools.js';
import { cardUiResult } from '../mcp/card-ui.mjs';

test('batch name search retains complete effects instead of matching activation hints', () => {
  const cards = [1, 2, 3, 4].map(id => ({ id, name: '测试连接怪兽', effectText: '怪兽2只\n①：完整效果甲。\n②：完整效果乙。', strings: ['「测试连接怪兽」效果适用中'], type: 'Monster / Effect / Link', typeTags: ['monster', 'effect', 'link'], attributeText: 'Dark', raceText: 'Cyberse', atk: 800, def: 5, level: 2, alias: 0 }));
  const cardsDb = { getById: id => cards.find(c => c.id === id), getByName: () => cards[0], searchByName: () => cards };
  const result = searchCards({ query: '测试连接怪兽', mode: 'name', limit: 20, cardsDb });
  assert.equal(result.ok, true);
  assert.equal(result.data.results.length, 4);
  const ui = cardUiResult({ result }, []);
  for (const card of ui.structuredContent.cards) assert.equal(card.effect, cards[0].effectText);
  assert.match(result.data.results[0].effectSnippet, /效果适用中/);
});

test('name search keeps full database effects for all I:P artwork records', { skip: process.env.DUEL_COMPASS_INTEGRATION !== '1' }, () => {
  try {
    const search = searchCards({ query: '百变莱娜', mode: 'name', limit: 20 });
    assert.equal(search.ok, true);
    assert.equal(search.data.results.length, 4);
    const ui = cardUiResult({ result: search }, []);
    assert.equal(ui.structuredContent.cards.length, 4);
    for (const [index, card] of search.data.results.entries()) {
      const exact = getCardEffect({ cardId: card.id });
      assert.equal(exact.ok, true);
      assert.equal(card.effectText, exact.data.effectText);
      assert.match(card.effectText, /①/);
      assert.match(card.effectText, /②/);
      assert.match(card.effectSnippet, /效果适用中/);
      assert.equal(ui.structuredContent.cards[index].effect, exact.data.effectText);
    }
  } finally {
    closeSharedCardsDatabase();
  }
});

test('UI never presents a search hint as the card effect when full text is absent', () => {
  const ui = cardUiResult({ result: { data: { results: [
    { id: 1, name: 'test', effectSnippet: '效果适用中' },
  ] } } }, []);
  assert.equal(ui.structuredContent.cards[0].effect, '');
});
