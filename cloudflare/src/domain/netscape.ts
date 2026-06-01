import { normalizeUrl } from './url-normalize';

export type ExportBookmark = {
  url: string;
  title: string;
  description: string;
  notes: string;
  tags: string[];
  archived: boolean;
  unread: boolean;
  shared: boolean;
  dateAdded: string;
};

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toNetcapeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const epoch = Math.floor(d.getTime() / 1000);
  return String(epoch);
}

export function exportNetscape(bookmarks: ExportBookmark[]): string {
  const lines: string[] = [];
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  lines.push('<!-- This is an automatically generated file. -->');
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push('<TITLE>cloudpin bookmarks</TITLE>');
  lines.push('<H1>Bookmarks</H1>');
  lines.push('<DL><p>');
  lines.push(
    '    <DT><H3 ADD_DATE="' + toNetcapeDate(new Date().toISOString()) + '">cloudpin</H3>'
  );
  lines.push('    <DL><p>');
  for (const b of bookmarks) {
    if (!b.url) continue;
    const tags = b.tags.filter(Boolean).join(',');
    const attrs: string[] = [
      `HREF="${escapeAttr(b.url)}"`,
      `ADD_DATE="${toNetcapeDate(b.dateAdded)}"`
    ];
    if (b.archived) attrs.push('TOREAD="0"');
    if (b.unread) attrs.push('TOREAD="1"');
    if (b.shared) attrs.push('SHARED="1"');
    if (tags) attrs.push(`TAGS="${escapeAttr(tags)}"`);
    lines.push(`        <DT><A ${attrs.join(' ')}>${escapeHtml(b.title || b.url)}</A>`);
    if (b.description) lines.push(`        <DD>${escapeHtml(b.description)}`);
    if (b.notes) {
      lines.push(`        <DD><pre>${escapeHtml(b.notes)}</pre>`);
    }
  }
  lines.push('    </DL><p>');
  lines.push('</DL><p>');
  return lines.join('\n');
}

void normalizeUrl;
