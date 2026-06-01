const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) return true;
  return false;
}

const FAVICON_PROVIDER = (url: string): string =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32`;

export async function fetchFavicon(
  url: string,
  env: { FAVICON_PROVIDER?: string }
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  const provider = env.FAVICON_PROVIDER ?? FAVICON_PROVIDER(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(provider, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/*' }
    });
    if (!res.ok) return null;
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    const contentType = res.headers.get('content-type') ?? 'image/x-icon';
    return { body: buf, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isImageContentType(ct: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i.test(ct);
}
