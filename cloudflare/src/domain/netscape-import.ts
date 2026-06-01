import { normalizeTagName } from './tags';

export type ImportedBookmark = {
  url: string;
  title: string;
  description: string;
  notes: string;
  tags: string[];
  archived: boolean;
  unread: boolean;
  shared: boolean;
  dateAdded: string | null;
};

const ATTR_RE = /([A-Z_]+)\s*=\s*"([^"]*)"/g;
const FOLD_RE = /[\r\n\t]+/g;
const ENTITY_RE = /&#(\d+);/g;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(ENTITY_RE, (_m, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(FOLD_RE, ' ')
    .trim();
}

function stripTagsPreserveLines(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseDateAttr(s: string | undefined): string | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function importNetscape(html: string): ImportedBookmark[] {
  const result: ImportedBookmark[] = [];
  const re = /<DT>\s*<A\s+([^>]+)>([\s\S]*?)<\/A>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrsStr = m[1] ?? '';
    const innerTitle = m[2] ?? '';
    const attrs: Record<string, string> = {};
    let am: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((am = ATTR_RE.exec(attrsStr)) !== null) {
      attrs[am[1]!.toUpperCase()] = decodeHtml(am[2] ?? '');
    }
    const url = attrs['HREF']?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const rawTitle = decodeHtml(stripTags(innerTitle)) || url;
    const tagsAttr = attrs['TAGS'] ?? '';
    const tags = tagsAttr
      .split(',')
      .map((t) => normalizeTagName(t))
      .filter(Boolean);
    const toRead = (attrs['TOREAD'] ?? '').toLowerCase();
    const shared = (attrs['SHARED'] ?? '').toLowerCase() === '1';
    const archived = toRead === '0';
    const unread = toRead === '1';
    const lookAhead = html.slice(m.index + m[0].length, m.index + m[0].length + 4096);
    const ddChunks: string[] = [];
    const noteChunks: string[] = [];
    const ddRe = /<DD>([\s\S]*?)(?=<DT>|<DD>|<\/DL>)/gi;
    let ddM: RegExpExecArray | null;
    while ((ddM = ddRe.exec(lookAhead)) !== null) {
      const block = ddM[1] ?? '';
      const preMatch = /<pre>([\s\S]*?)<\/pre>/i.exec(block);
      if (preMatch) {
        noteChunks.push(decodeHtml(stripTagsPreserveLines(preMatch[1] ?? '')));
      } else {
        const txt = decodeHtml(stripTags(block));
        if (txt) ddChunks.push(txt);
      }
    }
    const description = ddChunks.join(' ').trim();
    const notes = noteChunks.join('\n').trim();
    result.push({
      url,
      title: rawTitle.slice(0, 512),
      description,
      notes,
      tags,
      archived,
      unread: unread || (!archived && !shared),
      shared,
      dateAdded: parseDateAttr(attrs['ADD_DATE']) ?? nowIso()
    });
  }
  return result;
}
