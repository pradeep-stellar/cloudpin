import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('returns empty string for blank input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   ')).toBe('');
  });

  it('renders plain text in a paragraph', () => {
    const html = renderMarkdown('hello world');
    expect(html).toContain('hello world');
    expect(html).toMatch(/<p>/);
  });

  it('renders headings and links', () => {
    const html = renderMarkdown('# Title\n\nVisit [docs](https://example.com/docs)');
    expect(html).toContain('<h1');
    expect(html).toContain('href="https://example.com/docs"');
  });

  it('renders fenced code blocks', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1');
  });

  it('strips script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nSafe');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).toContain('Safe');
  });

  it('strips javascript: URLs', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips inline event handlers', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html.toLowerCase()).not.toContain('onerror');
  });
});
