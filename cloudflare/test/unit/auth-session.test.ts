import { describe, it, expect } from 'vitest';
import {
  signSessionCookie,
  verifySessionCookie,
  newSessionId,
  currentDayBucket,
  SESSION_COOKIE_NAME
} from '../../src/lib/server/auth/session';

const SECRET = 'test-app-secret-32-bytes-or-more-yes';

describe('SESSION_COOKIE_NAME', () => {
  it('is exported', () => {
    expect(SESSION_COOKIE_NAME).toBe('cloudpin_session');
  });
});

describe('newSessionId', () => {
  it('produces a base64url of expected length', () => {
    const id = newSessionId();
    expect(id.length).toBeGreaterThan(20);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces different ids each call', () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
  });
});

describe('signSessionCookie / verifySessionCookie', () => {
  it('round-trips a session', async () => {
    const payload = {
      sessionId: newSessionId(),
      userId: 42,
      dayBucket: currentDayBucket()
    };
    const cookie = await signSessionCookie(SECRET, payload);
    const verified = await verifySessionCookie(SECRET, cookie);
    expect(verified).toEqual(payload);
  });

  it('rejects a cookie with a different secret', async () => {
    const payload = { sessionId: newSessionId(), userId: 1, dayBucket: currentDayBucket() };
    const cookie = await signSessionCookie(SECRET, payload);
    expect(await verifySessionCookie('different-secret', cookie)).toBeNull();
  });

  it('rejects a cookie with a tampered body', async () => {
    const payload = { sessionId: newSessionId(), userId: 1, dayBucket: currentDayBucket() };
    const cookie = await signSessionCookie(SECRET, payload);
    const tampered = cookie.replace(/\.\d+\./, '.999.');
    expect(await verifySessionCookie(SECRET, tampered)).toBeNull();
  });

  it('rejects an expired (too old) cookie', async () => {
    const payload = {
      sessionId: newSessionId(),
      userId: 1,
      dayBucket: currentDayBucket() - 100
    };
    const cookie = await signSessionCookie(SECRET, payload);
    expect(await verifySessionCookie(SECRET, cookie)).toBeNull();
  });

  it('rejects malformed cookies', async () => {
    expect(await verifySessionCookie(SECRET, '')).toBeNull();
    expect(await verifySessionCookie(SECRET, 'one.two')).toBeNull();
    expect(await verifySessionCookie(SECRET, 'a.b.c.d.e.f')).toBeNull();
  });

  it('rejects a wrong-version cookie', async () => {
    const cookie = 'v9.abc.1.1.signature';
    expect(await verifySessionCookie(SECRET, cookie)).toBeNull();
  });
});
