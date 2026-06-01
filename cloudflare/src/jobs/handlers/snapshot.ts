// Cloudflare Browser Run (formerly Browser Rendering) exposes a Fetcher binding
// with a `.quickAction()` RPC method that is the modern, idiomatic way to
// capture snapshots and PDFs from a Worker. The .quickAction() method requires
// a compatibility date of 2026-03-24 or later and is not yet supported in
// local development mode (use `wrangler dev --remote` or `remote: true`).
//
// References:
//   https://developers.cloudflare.com/browser-run/quick-actions/snapshot/
//   https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/
//   https://developers.cloudflare.com/browser-run/reference/wrangler/#bindings
//
// The wrangler-generated Env type still types the browser binding as a plain
// `Fetcher`, so we narrow it here. The cast at the queue-consumer boundary is
// safe because the binding is only ever invoked through this module.

type QuickAction = 'snapshot' | 'pdf' | 'screenshot' | 'markdown' | 'content';

export type BrowserRun = Fetcher & {
  quickAction(method: QuickAction, params: Record<string, unknown>): Promise<Response>;
};

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

type SnapshotResponse = {
  success?: boolean;
  result?: {
    content?: string;
  };
};

export async function captureHtml(
  url: string,
  browser: BrowserRun | undefined
): Promise<SnapshotResult | null> {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  if (!browser) return await fetchHtmlDirect(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await browser.quickAction('snapshot', { url });
    if (!res.ok) return await fetchHtmlDirect(url);
    const data = (await res.json()) as SnapshotResponse;
    const html = data.success ? data.result?.content : undefined;
    if (!html) return await fetchHtmlDirect(url);
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > HTML_MAX_BYTES) return null;
    return {
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
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

export async function capturePdf(
  url: string,
  browser: BrowserRun | undefined
): Promise<SnapshotResult | null> {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  if (!browser) return await fetchPdfDirect(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await browser.quickAction('pdf', {
      url,
      pdfOptions: { printBackground: true }
    });
    if (!res.ok) return await fetchPdfDirect(url);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > PDF_MAX_BYTES) return null;
    return {
      body: buf,
      contentType: 'application/pdf',
      format: 'pdf',
      filename: `${parsed.hostname}-${Date.now()}.pdf`
    };
  } catch {
    return await fetchPdfDirect(url);
  } finally {
    clearTimeout(timeout);
  }
}

function parseHttpUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  return parsed;
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

async function fetchPdfDirect(_url: string): Promise<SnapshotResult | null> {
  // Workers cannot shell out to a CLI like wkhtmltopdf. When the browser
  // binding is absent (or .quickAction() fails in local dev) we have no
  // server-side PDF path, so we fail soft and let the job retry via the
  // queue's DLQ with a clear reason.
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
