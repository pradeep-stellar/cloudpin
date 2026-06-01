import { describe, it, expect } from 'vitest';
import {
  toBase64Url,
  fromBase64Url,
  toHex,
  fromHex,
  constantTimeEqual,
  sha256,
  hmacSha256,
  randomBytes,
  safeEqualString
} from '../../src/lib/server/auth/crypto';

describe('toBase64Url / fromBase64Url', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it('produces no +, /, or =', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = randomBytes(32);
      const encoded = toBase64Url(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it('rejects invalid base64url characters', () => {
    expect(() => fromBase64Url('!@#$')).toThrow();
  });
});

describe('toHex / fromHex', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
  });

  it('rejects odd length', () => {
    expect(() => fromHex('abc')).toThrow();
  });

  it('rejects invalid hex chars', () => {
    expect(() => fromHex('zz')).toThrow();
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('returns false for different arrays of same length', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('sha256', () => {
  it('produces the known SHA-256 of "abc"', async () => {
    const hash = await sha256('abc');
    expect(toHex(hash)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('produces a 32-byte hash', async () => {
    const hash = await sha256('anything');
    expect(hash.length).toBe(32);
  });
});

describe('hmacSha256', () => {
  it('produces the known HMAC-SHA-256 of ("key", "The quick brown fox jumps over the lazy dog")', async () => {
    const mac = await hmacSha256('key', 'The quick brown fox jumps over the lazy dog');
    expect(toHex(mac)).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
});

describe('safeEqualString', () => {
  it('matches equal strings', () => {
    expect(safeEqualString('abc', 'abc')).toBe(true);
  });

  it('rejects different strings', () => {
    expect(safeEqualString('abc', 'abd')).toBe(false);
  });

  it('rejects different lengths', () => {
    expect(safeEqualString('abc', 'abcd')).toBe(false);
  });
});
