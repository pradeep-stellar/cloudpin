import { describe, it, expect } from 'vitest';
import { buildCsrfToken, CSRF_FORM_FIELD } from '../../src/lib/server/auth/csrf';
import { checkCsrf } from '../../src/lib/server/auth/middleware';
import { requireFormCsrf } from '../../src/lib/server/auth/form-action';
import type { AuthState } from '../../src/lib/server/auth/types';

const APP_SECRET = 'form-action-test-secret-1234567890';

const BROWSER_SESSION: AuthState = {
  kind: 'browser_session',
  user: {
    id: 42,
    email: 'u@example.com',
    username: 'u',
    displayName: 'U',
    isAdmin: false
  },
  sessionId: 'sess-abc'
};

function makeFormRequest(body: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.append(k, v);
  return new Request('https://app.example.com/bookmarks/new', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
}

async function currentToken(userId = 42, sessionId = 'sess-abc'): Promise<string> {
  return buildCsrfToken(APP_SECRET, {
    userId,
    sessionId,
    dayBucket: Math.floor(Date.now() / 1000 / 86400),
    nonce: 'ui'
  });
}

async function guardedActionStatus(input: {
  url: string;
  body: Record<string, string>;
  successStatus?: number;
  env?: Record<string, unknown>;
}): Promise<number> {
  const request = new Request(input.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(input.body).toString()
  });
  const failure = await requireFormCsrf({
    request,
    locals: {
      auth: {
        state: BROWSER_SESSION,
        requestId: 'req-test',
        origin: 'https://app.example.com',
        isMutation: true
      }
    },
    platform: {
      env: {
        DB: {} as D1Database,
        ASSETS_BUCKET: {} as R2Bucket,
        JOBS: {} as Queue,
        APP_SECRET,
        ...input.env
      },
      context: {
        waitUntil(promise: Promise<unknown>) {
          void promise;
        },
        passThroughOnException() {}
      }
    }
  });
  return failure ? failure.status : (input.successStatus ?? 200);
}

describe('checkCsrf on form action submissions', () => {
  it('accepts a valid _csrf field on a form-urlencoded POST', async () => {
    const token = await currentToken();
    const req = makeFormRequest({ url: 'https://example.com', _csrf: token });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects when the _csrf field is missing from a mutation form', async () => {
    const req = makeFormRequest({ url: 'https://example.com' });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_token');
  });

  it('rejects when the _csrf field is present but the value is wrong', async () => {
    const req = makeFormRequest({ _csrf: 'not-a-real-token' });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_token');
  });

  it('rejects when the token was issued for a different user', async () => {
    const otherUsersToken = await currentToken(99);
    const req = makeFormRequest({ _csrf: otherUsersToken });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when the Origin header does not match the request URL', async () => {
    const token = await currentToken();
    const req = makeFormRequest({ _csrf: token });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://evil.example.com'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_origin');
  });

  it('rejects when the state is not a browser session (e.g. unauthenticated)', async () => {
    const token = await currentToken();
    const req = makeFormRequest({ _csrf: token });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: { kind: 'unauthenticated' },
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_session');
  });

  it('rejects when APP_SECRET is not configured (production misconfig)', async () => {
    const token = await currentToken();
    const req = makeFormRequest({ _csrf: token });
    const result = await checkCsrf({
      env: { DB: {} as D1Database },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_app_secret');
  });

  it('CSRF_FORM_FIELD is the conventional _csrf', () => {
    expect(CSRF_FORM_FIELD).toBe('_csrf');
  });

  it('round-trips a form-encoded submission for a bundles edit form', async () => {
    const token = await currentToken();
    const req = new Request('https://app.example.com/bundles/3/edit?/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: 'Reading list',
        search: '',
        any_tags: 'js',
        all_tags: '',
        excluded_tags: '',
        filter_unread: 'off',
        filter_shared: 'off',
        _csrf: token
      }).toString()
    });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result).toEqual({ ok: true });
  });

  it('round-trips a tags rename form', async () => {
    const token = await currentToken();
    const req = new Request('https://app.example.com/tags?/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id: '5', name: 'rust', _csrf: token }).toString()
    });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result).toEqual({ ok: true });
  });

  it('round-trips a settings profile form', async () => {
    const token = await currentToken();
    const req = new Request('https://app.example.com/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ theme: 'dark', _csrf: token }).toString()
    });
    const result = await checkCsrf({
      env: { DB: {} as D1Database, APP_SECRET },
      state: BROWSER_SESSION,
      request: req,
      origin: 'https://app.example.com'
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('requireFormCsrf on route form actions', () => {
  const actionCases: Array<{
    group: string;
    url: string;
    body: Record<string, string>;
    successStatus: number;
  }> = [
    {
      group: 'bookmarks',
      url: 'https://app.example.com/bookmarks/new',
      body: { url: 'https://example.com' },
      successStatus: 303
    },
    {
      group: 'bundles',
      url: 'https://app.example.com/bundles/3/edit?/update',
      body: { name: 'Reading list' },
      successStatus: 200
    },
    {
      group: 'tags',
      url: 'https://app.example.com/tags?/rename',
      body: { id: '5', name: 'rust' },
      successStatus: 200
    },
    {
      group: 'settings',
      url: 'https://app.example.com/settings',
      body: { theme: 'dark' },
      successStatus: 200
    }
  ];

  for (const c of actionCases) {
    it(`returns 403 before ${c.group} form action work when _csrf is missing`, async () => {
      await expect(guardedActionStatus(c)).resolves.toBe(403);
    });

    it(`lets ${c.group} form action work continue when _csrf is valid`, async () => {
      const token = await currentToken();
      await expect(guardedActionStatus({ ...c, body: { ...c.body, _csrf: token } })).resolves.toBe(
        c.successStatus
      );
    });
  }

  it('honors the CLOUDPIN_E2E_BYPASS_AUTH skip branch without APP_SECRET', async () => {
    await expect(
      guardedActionStatus({
        url: 'https://app.example.com/bookmarks/new',
        body: { url: 'https://example.com' },
        env: { APP_SECRET: undefined, CLOUDPIN_E2E_BYPASS_AUTH: '1' }
      })
    ).resolves.toBe(200);
  });
});
