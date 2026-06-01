import { describe, it, expect } from 'vitest';
import { exportNetscape, type ExportBookmark } from '../../src/domain/netscape';
import { importNetscape } from '../../src/domain/netscape-import';

describe('Netscape export/import', () => {
  const sample: ExportBookmark[] = [
    {
      url: 'https://example.com/path?x=1',
      title: 'Example & Co',
      description: 'A description with <html>',
      notes: 'multi\nline\nnotes',
      tags: ['js', 'web'],
      archived: false,
      unread: true,
      shared: false,
      dateAdded: '2024-01-02T03:04:05Z'
    },
    {
      url: 'https://other.example/',
      title: 'Other',
      description: '',
      notes: '',
      tags: ['rust'],
      archived: true,
      unread: false,
      shared: true,
      dateAdded: '2024-05-06T07:08:09Z'
    }
  ];

  it('exports Netscape header', () => {
    const out = exportNetscape(sample);
    expect(out).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(out).toContain('<H1>Bookmarks</H1>');
  });

  it('emits HREF, TAGS, TOREAD, SHARED, ADD_DATE', () => {
    const out = exportNetscape(sample);
    expect(out).toContain('HREF="https://example.com/path?x=1"');
    expect(out).toContain('TAGS="js,web"');
    expect(out).toContain('TOREAD="1"');
    expect(out).toContain('SHARED="1"');
    expect(out).toContain('TOREAD="0"');
  });

  it('escapes HTML in title and description', () => {
    const out = exportNetscape(sample);
    expect(out).toContain('Example &amp; Co');
    expect(out).toContain('&lt;html&gt;');
  });

  it('puts notes inside <pre>', () => {
    const out = exportNetscape(sample);
    expect(out).toContain('<pre>multi\nline\nnotes</pre>');
  });

  it('round-trips through importer', () => {
    const exported = exportNetscape(sample);
    const imported = importNetscape(exported);
    expect(imported).toHaveLength(2);
    expect(imported[0]!.url).toBe('https://example.com/path?x=1');
    expect(imported[0]!.title).toBe('Example & Co');
    expect(imported[0]!.description).toBe('A description with <html>');
    expect(imported[0]!.notes).toBe('multi\nline\nnotes');
    expect(imported[0]!.tags.sort()).toEqual(['js', 'web']);
    expect(imported[0]!.unread).toBe(true);
    expect(imported[0]!.archived).toBe(false);
    expect(imported[1]!.archived).toBe(true);
    expect(imported[1]!.shared).toBe(true);
  });

  it('parses a typical linkding export', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">Bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://example.org" ADD_DATE="1700000000" TAGS="a,b">Example</A>
        <DD>First
        <DT><A HREF="https://example.com" ADD_DATE="1700000100" TOREAD="1" TAGS="x">Other</A>
    </DL><p>
</DL><p>`;
    const result = importNetscape(html);
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toBe('https://example.org');
    expect(result[0]!.tags.sort()).toEqual(['a', 'b']);
    expect(result[1]!.unread).toBe(true);
  });

  it('skips entries without http(s) url', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="javascript:alert(1)">Bad</A>
    <DT><A HREF="https://ok.com">Good</A>
</DL><p>`;
    const result = importNetscape(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe('https://ok.com');
  });

  it('uses current date when ADD_DATE missing', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://x.com">x</A>
</DL><p>`;
    const result = importNetscape(html);
    expect(result[0]!.dateAdded).toBeTruthy();
    expect(new Date(result[0]!.dateAdded!).getTime()).toBeGreaterThan(0);
  });
});
