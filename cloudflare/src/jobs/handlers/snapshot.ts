export type SnapshotFormat = 'html' | 'pdf';

const HTML_MAX_BYTES = 5 * 1024 * 1024;
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) return true;
  return false;
}

export type SnapshotResult = {
  body: ArrayBuffer;
  contentType: string;
  format: SnapshotFormat;
  filename: string;
};

export async function captureHtml(
  url: string,
  browser: Fetcher | undefined
): Promise<SnapshotResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  if (!browser) {
    return await fetchHtmlDirect(url);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await browser.fetch('https://api.cloudflare.com/client/v4/accounts/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, htmlOptions: { screenshot: false } }),
      signal: controller.signal
    });
    if (!res.ok) return await fetchHtmlDirect(url);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > HTML_MAX_BYTES) return null;
    return {
      body: buf,
      contentType: 'text/html; charset=utf-8',
      format: 'html',
      filename: `${parsed.hostname}-${Date.now()}.html`
    };
  } catch {
    return await fetchHtmlDirect(url);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlDirect(url: string): Promise<SnapshotResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'cloudpin/1.0 (+https://github.com/anomalyco/opencode)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'text/html';
    if (!/^(text\/html|application\/xhtml\+xml)/.test(contentType)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > HTML_MAX_BYTES) return null;
    let host = 'snapshot';
    try {
      host = new URL(url).hostname;
    } catch {
      /* ignore */
    }
    return {
      body: buf,
      contentType,
      format: 'html',
      filename: `${host}-${Date.now()}.html`
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function capturePdf(
  url: string,
  browser: Fetcher | undefined
): Promise<SnapshotResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  if (!browser) {
    return await fetchPdfWithWkhtmltopdf(url);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await browser.fetch('https://api.cloudflare.com/client/v4/accounts/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pdfOptions: { printBackground: true } }),
      signal: controller.signal
    });
    if (!res.ok) return await fetchPdfWithWkhtmltopdf(url);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > PDF_MAX_BYTES) return null;
    return {
      body: buf,
      contentType: 'application/pdf',
      format: 'pdf',
      filename: `${parsed.hostname}-${Date.now()}.pdf`
    };
  } catch {
    return await fetchPdfWithWkhtmltopdf(url);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPdfWithWkhtmltopdf(_url: string): Promise<SnapshotResult | null> {
  return null;
}

export async function gzipBuffer(
  buf: ArrayBuffer
): Promise<{ body: ArrayBuffer; encoding: 'gzip' }> {
  const stream = new Response(buf).body;
  if (!stream) throw new Error('no_body');
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  const ab = await new Response(compressed).arrayBuffer();
  return { body: ab, encoding: 'gzip' };
}
