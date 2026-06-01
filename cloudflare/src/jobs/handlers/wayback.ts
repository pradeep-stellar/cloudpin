const TIMEOUT_MS = 30_000;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) return true;
  return false;
}

export type WaybackResult = { ok: boolean; snapshotUrl?: string; reason?: string };

export async function submitToWayback(url: string): Promise<WaybackResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: 'private_host' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://web.archive.org/save/${encodeURIComponent(url)}`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'cloudpin/1.0 (+https://github.com/anomalyco/opencode)',
        Accept: 'application/json,text/html'
      }
    });
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const snapshotUrl = res.headers.get('content-location') ?? res.url;
    return { ok: true, snapshotUrl };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}
