import { describe, it, expect, vi, afterEach } from 'vitest';
import { submitToWayback } from '../../src/jobs/handlers/wayback';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('submitToWayback', () => {
  it('rejects invalid URLs', async () => {
    const r = await submitToWayback('not a url');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_url');
  });

  it('rejects unsupported protocols', async () => {
    const r = await submitToWayback('ftp://example.com/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsupported_protocol');
  });

  it('rejects private hosts', async () => {
    const r = await submitToWayback('http://localhost/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('private_host');
    const r2 = await submitToWayback('http://192.168.1.1/');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('private_host');
  });

  it('maps HTTP 429 to rate_limited', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 429 })) as typeof fetch;
    const r = await submitToWayback('https://example.com/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rate_limited');
  });

  it('returns ok with snapshot URL on success', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('', {
          status: 200,
          headers: { 'content-location': 'https://web.archive.org/web/2024/abc' }
        })
    ) as typeof fetch;
    const r = await submitToWayback('https://example.com/');
    expect(r.ok).toBe(true);
    expect(r.snapshotUrl).toBe('https://web.archive.org/web/2024/abc');
  });
});
