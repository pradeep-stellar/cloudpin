import { describe, it, expect } from 'vitest';
import { normalizeUrl, displayUrl, InvalidUrlError } from '../../src/domain/url-normalize';

describe('normalizeUrl', () => {
  it('lowercases scheme and host', () => {
    expect(normalizeUrl('HTTPS://Example.COM/path')).toBe('https://example.com/path');
  });

  it('strips default https port 443', () => {
    expect(normalizeUrl('https://example.com:443/foo')).toBe('https://example.com/foo');
  });

  it('strips default http port 80', () => {
    expect(normalizeUrl('http://example.com:80/foo')).toBe('http://example.com/foo');
  });

  it('keeps non-default ports', () => {
    expect(normalizeUrl('https://example.com:8443/foo')).toBe('https://example.com:8443/foo');
  });

  it('drops trailing slash on root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('keeps non-root trailing slashes', () => {
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo/');
  });

  it('drops the fragment by default', () => {
    expect(normalizeUrl('https://example.com/foo#section')).toBe('https://example.com/foo');
  });

  it('keeps the fragment when stripFragment=false', () => {
    expect(normalizeUrl('https://example.com/foo#x', { stripFragment: false })).toBe(
      'https://example.com/foo#x'
    );
  });

  it('strips utm_* tracking params', () => {
    expect(normalizeUrl('https://example.com/?utm_source=x&a=1')).toBe('https://example.com?a=1');
    expect(normalizeUrl('https://example.com/?utm_medium=mail&a=1')).toBe(
      'https://example.com?a=1'
    );
    expect(normalizeUrl('https://example.com/?utmcampaign=foo&a=1')).toBe(
      'https://example.com?a=1&utmcampaign=foo'
    );
  });

  it('strips well-known tracking params', () => {
    expect(normalizeUrl('https://example.com/?fbclid=abc&a=1')).toBe('https://example.com?a=1');
    expect(normalizeUrl('https://example.com/?gclid=abc&a=1')).toBe('https://example.com?a=1');
    expect(normalizeUrl('https://example.com/?ref=tw&a=1')).toBe('https://example.com?a=1');
    expect(normalizeUrl('https://example.com/?source=foo&a=1')).toBe('https://example.com?a=1');
  });

  it('keeps tracking params when prefix list is empty', () => {
    expect(
      normalizeUrl('https://example.com/?utm_source=x&a=1', {
        trackingParamPrefixes: [],
        trackingParamExact: new Set()
      })
    ).toBe('https://example.com?a=1&utm_source=x');
  });

  it('sorts query params when sortQuery=true', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1&c=3', { sortQuery: true })).toBe(
      'https://example.com?a=1&b=2&c=3'
    );
  });

  it('preserves query order when sortQuery=false', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1&c=3', { sortQuery: false })).toBe(
      'https://example.com?b=2&a=1&c=3'
    );
  });

  it('sorts query params with multiple same key', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1&a=0')).toBe(
      'https://example.com?a=0&a=1&b=2'
    );
  });

  it('adds https when no scheme', () => {
    expect(normalizeUrl('example.com/foo')).toBe('https://example.com/foo');
  });

  it('is idempotent', () => {
    const once = normalizeUrl('HTTP://Example.COM:443/?b=2&a=1&utm_source=x#x');
    const twice = normalizeUrl(once);
    expect(twice).toBe(once);
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => normalizeUrl('ftp://example.com/')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('mailto:hi@example.com')).toThrow(InvalidUrlError);
  });

  it('rejects empty input', () => {
    expect(() => normalizeUrl('')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('   ')).toThrow(InvalidUrlError);
  });

  it('preserves percent-encoding in path', () => {
    expect(normalizeUrl('https://example.com/hello%20world')).toBe(
      'https://example.com/hello%20world'
    );
  });

  it('keeps encoded special characters in path safely', () => {
    expect(normalizeUrl('https://example.com/a%2Fb')).toBe('https://example.com/a%2Fb');
  });
});

describe('displayUrl', () => {
  it('returns host + path + query', () => {
    expect(displayUrl('https://example.com/foo?a=1')).toBe('example.com/foo?a=1');
  });

  it('strips scheme', () => {
    expect(displayUrl('https://example.com')).toBe('example.com');
  });
});
