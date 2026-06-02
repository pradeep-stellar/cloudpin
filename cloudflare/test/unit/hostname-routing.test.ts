import { describe, it, expect } from 'vitest';
import { decideHostnameRouting } from '../../src/domain/hostname-routing';

describe('decideHostnameRouting', () => {
  it('treats all requests as private when PUBLIC_HOSTNAME is empty', () => {
    expect(decideHostnameRouting('https://app.example.com/api/bookmarks', undefined)).toEqual({
      kind: 'private'
    });
    expect(decideHostnameRouting('https://app.example.com/api/bookmarks', '')).toEqual({
      kind: 'private'
    });
  });

  it('treats requests to a non-public host as private', () => {
    expect(
      decideHostnameRouting('https://app.example.com/api/bookmarks', 'share.example.com')
    ).toEqual({ kind: 'private' });
  });

  it('matches a request to the public host with /public/*', () => {
    const decision = decideHostnameRouting(
      'https://share.example.com/public/assets/123',
      'share.example.com'
    );
    expect(decision).toEqual({ kind: 'public', allowed: true, matchedPrefix: '/public' });
  });

  it('matches /public without a trailing path', () => {
    const decision = decideHostnameRouting('https://share.example.com/public', 'share.example.com');
    expect(decision).toEqual({ kind: 'public', allowed: true, matchedPrefix: '/public' });
  });

  it('matches /health on the public host', () => {
    const decision = decideHostnameRouting('https://share.example.com/health', 'share.example.com');
    expect(decision).toEqual({ kind: 'public', allowed: true, matchedPrefix: '/health' });
  });

  it('rejects /api/bookmarks on the public host', () => {
    const decision = decideHostnameRouting(
      'https://share.example.com/api/bookmarks',
      'share.example.com'
    );
    expect(decision).toEqual({ kind: 'public', allowed: false, pathname: '/api/bookmarks' });
  });

  it('rejects /bookmarks on the public host', () => {
    const decision = decideHostnameRouting(
      'https://share.example.com/bookmarks',
      'share.example.com'
    );
    expect(decision).toEqual({ kind: 'public', allowed: false, pathname: '/bookmarks' });
  });

  it('rejects the root path on the public host', () => {
    const decision = decideHostnameRouting('https://share.example.com/', 'share.example.com');
    expect(decision).toEqual({ kind: 'public', allowed: false, pathname: '/' });
  });

  it('does not match /publicish on the public host (strict prefix)', () => {
    const decision = decideHostnameRouting(
      'https://share.example.com/publicish',
      'share.example.com'
    );
    expect(decision).toEqual({
      kind: 'public',
      allowed: false,
      pathname: '/publicish'
    });
  });

  it('is case-insensitive on the configured hostname', () => {
    const decision = decideHostnameRouting(
      'https://share.example.com/public/assets/1',
      'SHARE.example.com'
    );
    expect(decision).toEqual({ kind: 'public', allowed: true, matchedPrefix: '/public' });
  });

  it('matches the public host on wrangler dev (URL hostname strips port)', () => {
    // wrangler dev URL is http://127.0.0.1:8788/...; the URL parser
    // returns hostname without the port. Production on Cloudflare also
    // sees a hostname without a port because TLS is terminated at the
    // edge. We only ever compare against the bare hostname, so ports
    // are irrelevant.
    const decision = decideHostnameRouting('http://127.0.0.1:8788/public/assets/1', '127.0.0.1');
    expect(decision).toEqual({ kind: 'public', allowed: true, matchedPrefix: '/public' });
  });
});
