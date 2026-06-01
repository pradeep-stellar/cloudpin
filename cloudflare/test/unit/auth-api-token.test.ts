import { describe, it, expect } from 'vitest';
import {
  generateApiToken,
  hashApiToken,
  extractBearerToken,
  validateTokenShape,
  safeEqualHash,
  tokenPrefix
} from '../../src/lib/server/auth/api-token';

describe('generateApiToken', () => {
  it('returns raw token, hash, and prefix', async () => {
    const gen = await generateApiToken();
    expect(gen.rawToken.length).toBeGreaterThanOrEqual(40);
    expect(gen.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(gen.tokenPrefix).toBe(gen.rawToken.slice(0, 6));
  });

  it('produces different raw tokens each time', async () => {
    const a = await generateApiToken();
    const b = await generateApiToken();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('hashApiToken', () => {
  it('is deterministic', async () => {
    const a = await hashApiToken('hello-world-token');
    const b = await hashApiToken('hello-world-token');
    expect(a).toBe(b);
  });

  it('changes when pepper changes', async () => {
    const a = await hashApiToken('hello-world-token');
    const b = await hashApiToken('hello-world-token', 'pepper1');
    expect(a).not.toBe(b);
  });
});

describe('tokenPrefix', () => {
  it('returns the first 6 chars', () => {
    expect(tokenPrefix('abcdefghijklmnop')).toBe('abcdef');
  });
});

describe('extractBearerToken', () => {
  it('parses "Authorization: Token <t>"', () => {
    expect(extractBearerToken('Token abc123')).toBe('abc123');
  });
  it('parses "Authorization: Bearer <t>"', () => {
    expect(extractBearerToken('Bearer xyz789')).toBe('xyz789');
  });
  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('token abc')).toBe('abc');
    expect(extractBearerToken('BEARER abc')).toBe('abc');
  });
  it('returns null for empty or missing header', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('   ')).toBeNull();
  });
  it('returns null for non-bearer schemes', () => {
    expect(extractBearerToken('Basic xyz')).toBeNull();
  });
});

describe('validateTokenShape', () => {
  it('accepts a base64url-looking string of valid length', () => {
    expect(validateTokenShape('abc123XYZ_-456789')).toBe(true);
  });
  it('rejects too-short strings', () => {
    expect(validateTokenShape('short')).toBe(false);
  });
  it('rejects strings with bad characters', () => {
    expect(validateTokenShape('a'.repeat(40) + '!')).toBe(false);
  });
});

describe('safeEqualHash', () => {
  it('returns true for equal hashes', async () => {
    expect(await safeEqualHash('abc', 'abc')).toBe(true);
  });
  it('returns false for different hashes', async () => {
    expect(await safeEqualHash('abc', 'abd')).toBe(false);
  });
});
