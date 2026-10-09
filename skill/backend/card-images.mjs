// Public image URLs documented at https://ygocdb.com/api. No image bytes are
// downloaded or persisted; HEAD checks avoid returning known missing images.
const CDN = 'https://cdn.233.momobako.com';
const cache = new Map();
const MAX_CACHE = 1000;
const STYLES = ['sc', 'ygopro', 'jp'];

export function createCardImageResolver({ fetchImpl = fetch, now = Date.now, timeoutMs = 2500 } = {}) {
  const pending = new Map();
  return async function resolveImage(id) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 0xffffffff) return { status: 'invalid-id', url: null };
    const cached = cache.get(id);
    if (fetchImpl === fetch && cached?.expires > now()) return cached.image;
    if (pending.has(id)) return pending.get(id);
    const request = (async () => {
      let networkFailure = false;
      for (const style of STYLES) {
        const url = `${CDN}/ygoimg/${style}/${id}.webp!half`;
        try {
          const response = await fetchImpl(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
          if (response.ok && /^image\//i.test(response.headers.get('content-type') ?? '')) {
            const image = { status: 'available', url, source: '百鸽', sourceUrl: 'https://ygocdb.com/api',
              cardPageUrl: `https://ygocdb.com/card/${id}`, language: style === 'sc' ? '简体中文' : style === 'jp' ? '日文' : 'YGOPro卡图',
              checkedAt: new Date(now()).toISOString() };
            if (fetchImpl === fetch) cache.set(id, { image, expires: now() + 3600000 });
            if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
            return image;
          }
          if (response.status >= 500 || response.status === 429 || response.status === 403) networkFailure = true;
        } catch { networkFailure = true; }
      }
      const image = { status: networkFailure ? 'unavailable' : 'not-found', url: null, source: '百鸽',
        cardPageUrl: `https://ygocdb.com/card/${id}`, note: networkFailure ? '卡图来源暂时不可用，请查看卡片详情。' : '未找到这张卡的可用卡图。' };
      if (fetchImpl === fetch) cache.set(id, { image, expires: now() + 60000 });
      return image;
    })().finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  };
}

const defaultResolver = createCardImageResolver();
export async function attachCardImages(result, { resolver = defaultResolver } = {}) {
  if (!result?.ok || !result.data) return result;
  const data = result.data;
  const cards = Array.isArray(data.results) ? data.results : Number.isSafeInteger(data.id) ? [data] : [];
  // Bound parallel requests for searches. All returned cards receive an image
  // entry, including a clear status when the source cannot serve an image.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, cards.length) }, async () => {
    while (cursor < cards.length) {
      const card = cards[cursor++];
      card.image = await resolver(card.id);
      const alt = String(card.name ?? card.id).replace(/[\[\]\r\n]/g, ' ');
      card.imageMarkdown = card.image.url ? `![${alt}](${card.image.url})` : null;
    }
  }));
  data.displayInstructions = '查卡默认同时提供卡图和资料，由卡片组件统一展示。用户已确认组件正常显示；正文不要重复组件中的基础资料和效果全文。单纯查卡只需简短确认，按用户要求补充解释。卡图不可用或组件失败时明确说明，不要自动打开浏览器预览作为替代。';
  return result;
}
