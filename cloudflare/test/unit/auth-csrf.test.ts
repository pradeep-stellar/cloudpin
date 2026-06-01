import { describe, it, expect } from 'vitest';
import {
  buildCsrfToken,
  verifyCsrfToken,
  CSRF_HEADER,
  CSRF_FORM_FIELD
} from '../../src/lib/server/auth/csrf';

const SECRET = 'test-app-secret-for-csrf-tokens';

describe('CSRF constants', () => {
  it('exposes the header and form field names', () => {
    expect(CSRF_HEADER).toBe('x-csrf-token');
    expect(CSRF_FORM_FIELD).toBe('_csrf');
  });
});

describe('buildCsrfToken / verifyCsrfToken', () => {
  it('round-trips a token', async () => {
    const parts = { userId: 7, sessionId: 'sess-abc', dayBucket: 20000, nonce: 'ui' };
    const token = await buildCsrfToken(SECRET, parts);
    expect(await verifyCsrfToken(SECRET, parts, token)).toBe(true);
  });

  it('rejects on userId mismatch', async () => {
    const parts = { userId: 7, sessionId: 'sess-abc', dayBucket: 20000, nonce: 'ui' };
    const token = await buildCsrfToken(SECRET, parts);
    expect(await verifyCsrfToken(SECRET, { ...parts, userId: 8 }, token)).toBe(false);
  });

  it('rejects on sessionId mismatch', async () => {
    const parts = { userId: 7, sessionId: 'sess-abc', dayBucket: 20000, nonce: 'ui' };
    const token = await buildCsrfToken(SECRET, parts);
    expect(await verifyCsrfToken(SECRET, { ...parts, sessionId: 'sess-xyz' }, token)).toBe(false);
  });

  it('rejects on dayBucket mismatch', async () => {
    const parts = { userId: 7, sessionId: 'sess-abc', dayBucket: 20000, nonce: 'ui' };
    const token = await buildCsrfToken(SECRET, parts);
    expect(await verifyCsrfToken(SECRET, { ...parts, dayBucket: 20001 }, token)).toBe(false);
  });

  it('rejects on a different secret', async () => {
    const parts = { userId: 7, sessionId: 'sess-abc', dayBucket: 20000, nonce: 'ui' };
    const token = await buildCsrfToken(SECRET, parts);
    expect(await verifyCsrfToken('other-secret', parts, token)).toBe(false);
  });
});
