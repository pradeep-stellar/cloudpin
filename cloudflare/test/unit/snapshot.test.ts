import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  gzipBuffer,
  captureHtml,
  capturePdf,
  type BrowserRun
} from '../../src/jobs/handlers/snapshot';

function makeBrowser(
  handler: (method: string, params: Record<string, unknown>) => Promise<Response>
): BrowserRun {
  return {
    fetch: vi.fn(),
    quickAction: vi.fn(handler)
  } as unknown as BrowserRun;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('gzipBuffer', () => {
  it('produces a non-empty compressed buffer', async () => {
    const original = new TextEncoder().encode('hello world '.repeat(100));
    const ab = original.buffer.slice(
      original.byteOffset,
      original.byteOffset + original.byteLength
    ) as ArrayBuffer;
    const gz = await gzipBuffer(ab);
    expect(gz.body.byteLength).toBeGreaterThan(0);
    expect(gz.encoding).toBe('gzip');
    const decompressed = new Response(
      new Response(gz.body).body!.pipeThrough(new DecompressionStream('gzip'))
    );
    const out = await new Response(decompressed.body).text();
    expect(out).toBe('hello world '.repeat(100));
  });
});

describe('captureHtml', () => {
  it('calls quickAction("snapshot") and returns the rendered HTML', async () => {
    const html = '<html><body>snapshot page</body></html>';
    const browser = makeBrowser(async (method, params) => {
      expect(method).toBe('snapshot');
      expect(params).toEqual({ url: 'https://example.com/' });
      return new Response(
        JSON.stringify({ success: true, result: { content: html, screenshot: 'AAAA' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await captureHtml('https://example.com/', browser);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('html');
    expect(result!.contentType).toBe('text/html; charset=utf-8');
    expect(new TextDecoder().decode(result!.body)).toBe(html);
    expect(result!.filename).toMatch(/^example\.com-\d+\.html$/);
  });

  it('falls back to direct fetch when quickAction returns a non-2xx', async () => {
    const browser = makeBrowser(async () => new Response('boom', { status: 500 }));
    const directFetch = vi.fn(async () => {
      return new Response('<html>fallback</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;

    const result = await captureHtml('https://example.com/', browser);
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!.body)).toBe('<html>fallback</html>');
    expect(directFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct fetch when quickAction throws (local dev no .quickAction)', async () => {
    const browser = makeBrowser(async () => {
      throw new Error('The RPC receiver does not implement the method "quickAction"');
    });
    const directFetch = vi.fn(async () => {
      return new Response('<html>direct</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;

    const result = await captureHtml('https://example.com/', browser);
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!.body)).toBe('<html>direct</html>');
  });

  it('returns null when quickAction returns success=false', async () => {
    const browser = makeBrowser(async () => {
      return new Response(JSON.stringify({ success: false, errors: [{ message: 'failed' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    const directFetch = vi.fn(async () => {
      return new Response('<html>nope</html>', { status: 500 });
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;

    const result = await captureHtml('https://example.com/', browser);
    expect(result).toBeNull();
  });

  it('returns null when content exceeds HTML_MAX_BYTES', async () => {
    const big = 'x'.repeat(6 * 1024 * 1024);
    const browser = makeBrowser(async () => {
      return new Response(JSON.stringify({ success: true, result: { content: big } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const result = await captureHtml('https://example.com/', browser);
    expect(result).toBeNull();
  });

  it('rejects private hosts before calling the browser', async () => {
    const quickAction = vi.fn();
    const browser = { fetch: vi.fn(), quickAction } as unknown as BrowserRun;
    const result = await captureHtml('http://127.0.0.1/x', browser);
    expect(result).toBeNull();
    expect(quickAction).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) URLs', async () => {
    const quickAction = vi.fn();
    const browser = { fetch: vi.fn(), quickAction } as unknown as BrowserRun;
    const result = await captureHtml('file:///etc/passwd', browser);
    expect(result).toBeNull();
    expect(quickAction).not.toHaveBeenCalled();
  });

  it('uses fetchHtmlDirect when browser is undefined', async () => {
    const directFetch = vi.fn(async () => {
      return new Response('<html>direct</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;

    const result = await captureHtml('https://example.com/', undefined);
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!.body)).toBe('<html>direct</html>');
  });
});

describe('capturePdf', () => {
  it('calls quickAction("pdf") and returns the PDF bytes', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const browser = makeBrowser(async (method, params) => {
      expect(method).toBe('pdf');
      expect(params).toEqual({
        url: 'https://example.com/',
        pdfOptions: { printBackground: true }
      });
      return new Response(pdfBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    });

    const result = await capturePdf('https://example.com/', browser);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('pdf');
    expect(result!.contentType).toBe('application/pdf');
    expect(new Uint8Array(result!.body)).toEqual(pdfBytes);
    expect(result!.filename).toMatch(/^example\.com-\d+\.pdf$/);
  });

  it('falls back to null when browser is undefined and direct PDF is not available', async () => {
    const result = await capturePdf('https://example.com/', undefined);
    expect(result).toBeNull();
  });

  it('returns null when quickAction returns non-2xx and direct PDF is not available', async () => {
    const browser = makeBrowser(async () => new Response('boom', { status: 502 }));
    const result = await capturePdf('https://example.com/', browser);
    expect(result).toBeNull();
  });

  it('returns null when PDF exceeds PDF_MAX_BYTES', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const browser = makeBrowser(async () => new Response(big, { status: 200 }));
    const result = await capturePdf('https://example.com/', browser);
    expect(result).toBeNull();
  });

  it('rejects private hosts', async () => {
    const quickAction = vi.fn();
    const browser = { fetch: vi.fn(), quickAction } as unknown as BrowserRun;
    const result = await capturePdf('http://10.0.0.1/', browser);
    expect(result).toBeNull();
    expect(quickAction).not.toHaveBeenCalled();
  });
});
