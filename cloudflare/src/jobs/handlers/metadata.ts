import { z } from 'zod';

export const MetaSchema = z.object({
  title: z.string().max(1024).optional(),
  description: z.string().max(4096).optional(),
  canonical: z.string().url().optional()
});
export type SiteMeta = z.infer<typeof MetaSchema>;

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower)) return true;
  return false;
}

export async function fetchSiteMeta(url: string): Promise<SiteMeta | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'cloudpin-bot/1.0 (+https://github.com/anomalyco/opencode)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_HTML_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return parseMeta(text, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMeta(html: string, baseUrl: string): SiteMeta {
  const out: SiteMeta = {};
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) {
    out.title = decodeEntities(stripTags(titleMatch[1] ?? '').slice(0, 1024));
  }
  const descMatch =
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html) ??
    /<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i.exec(html);
  if (descMatch && descMatch[1]) {
    out.description = decodeEntities((descMatch[1] ?? '').slice(0, 4096));
  }
  const canonicalMatch = /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i.exec(html);
  if (canonicalMatch && canonicalMatch[1]) {
    try {
      const u = new URL(canonicalMatch[1], baseUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.canonical = u.toString();
    } catch {
      /* ignore */
    }
  }
  return out;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}
