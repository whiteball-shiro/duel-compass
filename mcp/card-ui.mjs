import { readFileSync } from 'node:fs';

export const CARD_UI_URI = 'ui://duel-compass/card-lookup-v1.html';
export const CARD_UI_MIME = 'text/html;profile=mcp-app';
export const cardUiHtml = readFileSync(new URL('./card-ui.html', import.meta.url), 'utf8');

export function cardUiResult(response, images) {
  const data = response.result?.data ?? response.data;
  const cards = Array.isArray(data?.results) ? data.results : data?.id ? [data] : [];
  let imageIndex = 0;
  return {
    structuredContent: {
      cards: cards.map(card => ({
        id: card.id, name: card.name, type: card.type, attribute: card.attribute,
        race: card.race, level: card.level, atk: card.atkText ?? card.atk,
        def: card.defText ?? card.def, effect: card.effectText ?? card.effect ?? card.desc ?? '',
        imageIndex: card.image?.delivery === 'native-mcp-image' ? imageIndex++ : null,
      })),
    },
    _meta: { ui: { resourceUri: CARD_UI_URI }, nativeCardImages: images },
  };
}
