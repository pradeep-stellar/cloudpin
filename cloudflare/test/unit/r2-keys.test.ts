import { describe, it, expect } from 'vitest';
import { r2Keys } from '../../src/storage/asset-keys';

describe('r2Keys', () => {
  it('builds favicon keys', () => {
    expect(r2Keys.favicon('example.com', 'png')).toMatch(/^favicons\/[0-9a-f]{8}\.png$/);
  });

  it('builds preview keys with owner/bookmark/hash', () => {
    const k = r2Keys.preview(7, 42, 'https://example.com/path', 'jpg');
    expect(k).toMatch(/^previews\/7\/42\/[0-9a-f]{8}\.jpg$/);
  });

  it('builds asset keys with safeName', () => {
    const k = r2Keys.asset(1, 2, 3, 'my file!.pdf', 'pdf');
    expect(k).toMatch(/^assets\/1\/2\/3\/my_file_pdf\.pdf$/);
  });

  it('builds snapshot keys', () => {
    expect(r2Keys.snapshot(1, 2, 3, 'html')).toBe('snapshots/1/2/3/snapshot.html.gz');
    expect(r2Keys.snapshot(1, 2, 3, 'pdf')).toBe('snapshots/1/2/3/snapshot.pdf.gz');
  });

  it('builds import/export keys', () => {
    expect(r2Keys.import(7, 'abc')).toBe('imports/7/abc/source.html');
    expect(r2Keys.export(7, 'xyz')).toBe('exports/7/xyz/bookmarks.html');
  });

  it('sanitizes dots in filenames', () => {
    const k = r2Keys.asset(1, 2, 3, '../../../etc/passwd', '');
    expect(k).not.toContain('..');
    expect(k).toBe('assets/1/2/3/_etc_passwd.bin');
  });
});
