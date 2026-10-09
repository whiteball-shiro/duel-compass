// Deliver images through MCP's native image content, not external Markdown.
// Bytes stay in memory; no remote image files are saved on the user's disk.
const memoryCache = new Map();
const MAX_BYTES = 512 * 1024;

export async function cardImageContents(result, { fetchImpl = fetch } = {}) {
  const data = result?.result?.data;
  const cards = Array.isArray(data?.results) ? data.results : data?.id ? [data] : [];
  const blocks = new Array(cards.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, cards.length) }, async () => {
    while (cursor < cards.length) {
      const index = cursor++;
      const card = cards[index];
      const info = card.image;
      if (!info?.url || info.status !== 'available') continue;
      try {
        const url = new URL(info.url);
        if (url.origin !== 'https://cdn.233.momobako.com'
          || !new RegExp(`^/ygoimg/(sc|ygopro|jp)/${card.id}\\.webp!half$`).test(url.pathname)) throw new Error('Invalid card image source');
        let image = fetchImpl === fetch ? memoryCache.get(info.url) : null;
        if (!image || image.expires < Date.now()) {
          const response = await fetchImpl(info.url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
          const mimeType = (response.headers.get('content-type') ?? '').split(';')[0];
          if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('Source did not return an image');
          if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image exceeds the size limit');
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Image exceeds the size limit'); }
              chunks.push(Buffer.from(value));
            }
          } finally { reader.releaseLock(); }
          const bytes = Buffer.concat(chunks);
          const valid = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
            : mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
          if (!valid) throw new Error('Invalid image bytes');
          image = { block: { type: 'image', mimeType, data: bytes.toString('base64') }, expires: Date.now() + 3600000 };
          if (fetchImpl === fetch) {
            memoryCache.set(info.url, image);
            if (memoryCache.size > 128) memoryCache.delete(memoryCache.keys().next().value);
          }
        }
        blocks[index] = image.block;
        info.delivery = 'native-mcp-image';
        info.deliveryError = null;
      } catch (error) {
        info.delivery = 'unavailable';
        info.deliveryError = error.message;
      }
    }
  }));
  if (data) data.displayInstructions = '用户已确认卡图组件正常显示。卡图、基础资料和效果文本集中展示在组件内，正文不要重复卡名、密码、参数表或效果全文。单纯查卡只需简短确认；用户要求时再补充解释或打法。组件失效时明确说明并按需要提供文字资料，不要自动打开浏览器预览作为替代。';
  return blocks.filter(Boolean);
}
