import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { safeEqualHash, hashApiToken } from '../../src/lib/server/auth/api-token';

describe('hashApiToken + safeEqualHash', () => {
  it('produces deterministic 32-byte SHA-256 hex hashes', async () => {
    const a = await hashApiToken('mytoken', '');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const b = await hashApiToken('mytoken', '');
    expect(a).toBe(b);
  });

  it('produces different hashes with a pepper', async () => {
    const a = await hashApiToken('mytoken', '');
    const b = await hashApiToken('mytoken', 'pepper');
    expect(a).not.toBe(b);
  });

  it('safeEqualHash returns true for matching hashes', async () => {
    const a = await hashApiToken('x', '');
    expect(await safeEqualHash(a, a)).toBe(true);
  });

  it('safeEqualHash returns false for different hashes', async () => {
    const a = await hashApiToken('x', '');
    const b = await hashApiToken('y', '');
    expect(await safeEqualHash(a, b)).toBe(false);
  });

  it('safeEqualHash returns false for different lengths', async () => {
    const a = await hashApiToken('x', '');
    expect(await safeEqualHash(a, 'short')).toBe(false);
  });

  it('matches a manual SHA-256 computation', async () => {
    const token = 'manual-token';
    const expected = createHash('sha256').update(token).digest('hex');
    const got = await hashApiToken(token, '');
    expect(got).toBe(expected);
  });
});
