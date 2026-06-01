import { describe, it, expect } from 'vitest';
import { exportNetscape, type ExportBookmark } from '../../src/domain/netscape';
import { normalizeUrl } from '../../src/domain/url-normalize';
import { normalizeTagName } from '../../src/domain/tags';

function toExportBookmarks(
  sourceBookmarks: Array<{
    url: string;
    title: string;
    description: string;
    notes: string;
    is_archived: boolean;
    unread: boolean;
    shared: boolean;
    date_added: string;
    tag_names: string[];
  }>
): { bookmarks: ExportBookmark[]; skipped: number } {
  const out: ExportBookmark[] = [];
  let skipped = 0;
  for (const b of sourceBookmarks) {
    let norm: string;
    try {
      norm = normalizeUrl(b.url);
    } catch {
      skipped++;
      continue;
    }
    if (!norm) {
      skipped++;
      continue;
    }
    out.push({
      url: b.url,
      title: b.title,
      description: b.description,
      notes: b.notes,
      tags: b.tag_names.map((t) => normalizeTagName(t)).filter(Boolean),
      archived: b.is_archived,
      unread: b.unread,
      shared: b.shared,
      dateAdded: b.date_added
    });
  }
  return { bookmarks: out, skipped };
}

describe('migrate-linkding export shape', () => {
  it('skips invalid URLs', () => {
    const r = toExportBookmarks([
      {
        url: 'not a url',
        title: 'Bad',
        description: '',
        notes: '',
        is_archived: false,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: []
      }
    ]);
    expect(r.skipped).toBe(1);
    expect(r.bookmarks).toHaveLength(0);
  });

  it('normalizes tag names', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'x',
        description: '',
        notes: '',
        is_archived: false,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: ['JS', 'Type Script', '']
      }
    ]);
    expect(r.bookmarks[0]!.tags).toEqual(['js', 'type-script']);
  });

  it('produces importable Netscape HTML', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        notes: '',
        is_archived: false,
        unread: true,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: ['web']
      }
    ]);
    const html = exportNetscape(r.bookmarks);
    expect(html).toContain('HREF="https://example.com"');
    expect(html).toContain('TAGS="web"');
    expect(html).toContain('TOREAD="1"');
  });

  it('preserves archived flag', () => {
    const r = toExportBookmarks([
      {
        url: 'https://example.com',
        title: 'x',
        description: '',
        notes: '',
        is_archived: true,
        unread: false,
        shared: false,
        date_added: '2024-01-01T00:00:00Z',
        tag_names: []
      }
    ]);
    expect(r.bookmarks[0]!.archived).toBe(true);
  });
});
