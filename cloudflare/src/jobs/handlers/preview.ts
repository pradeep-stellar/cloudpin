const MAX_HTML_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8000;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) return true;
  return false;
}

function isLikelyPreviewImage(src: string, baseUrl: string): URL | null {
  try {
    const u = new URL(src, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isPrivateHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

function pickFirstPreviewImage(html: string, baseUrl: string): string | null {
  const metaOg = /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i.exec(html);
  if (metaOg && metaOg[1]) {
    const u = isLikelyPreviewImage(metaOg[1], baseUrl);
    if (u) return u.toString();
  }
  const metaTwitter = /<meta\s+name=["']twitter:image["']\s+content=["']([^"']*)["']/i.exec(html);
  if (metaTwitter && metaTwitter[1]) {
    const u = isLikelyPreviewImage(metaTwitter[1], baseUrl);
    if (u) return u.toString();
  }
  const linkImg = /<link\s+rel=["']image_src["']\s+href=["']([^"']*)["']/i.exec(html);
  if (linkImg && linkImg[1]) {
    const u = isLikelyPreviewImage(linkImg[1], baseUrl);
    if (u) return u.toString();
  }
  return null;
}

export async function fetchPreviewImage(
  pageUrl: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'cloudpin-bot/1.0 (+https://github.com/anomalyco/opencode)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const imageUrl = pickFirstPreviewImage(html, pageUrl);
    if (!imageUrl) return null;
    return await fetchImage(imageUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImage(
  imageUrl: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(imageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/*' }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(contentType)) return null;
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_IMAGE_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { body: buf, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
