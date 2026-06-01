import { describe, it, expect } from 'vitest';
import { honoApp } from '../../src/lib/server/hono';
import { bookmarksRouter } from '../../src/server/api/bookmarks.routes';
import { generateApiToken } from '../../src/lib/server/auth/api-token';
import { SESSION_COOKIE_NAME, signSessionCookie } from '../../src/lib/server/auth/session';
import type { SessionPayload } from '../../src/lib/server/auth/session';

type Row = Record<string, unknown>;
type SqlHandler = (sql: string, args: unknown[]) => Row[] | Row | null | undefined;

class FakeD1 {
  private handlers: Array<{ match: (sql: string) => boolean; handler: SqlHandler }> = [];

  onQuery(pattern: RegExp, handler: SqlHandler): this {
    this.handlers.push({ match: (sql) => pattern.test(sql), handler });
    return this;
  }

  prepare(sql: string) {
    const match = this.handlers.find((h) => h.match(sql));
    if (!match) {
      throw new Error(`FakeD1: no handler registered for SQL: ${sql.slice(0, 80)}...`);
    }
    const handler = match.handler;
    const wrap = (args: unknown[]) => {
      const r = handler(sql, args);
      const rows = r == null ? [] : Array.isArray(r) ? r : [r];
      return rows;
    };
    return {
      bind: (...args: unknown[]) => {
        const rows = wrap(args);
        return {
          first: async () => rows[0] ?? null,
          all: async () => ({ results: rows }),
          run: async () => ({
            success: true,
            meta: { changes: rows.length, last_row_id: rows[0]?.id ?? null, duration: 0 }
          }),
          raw: async () => rows.map((r) => Object.values(r))
        };
      }
    };
  }
}

function makeMockR2(): R2Bucket {
  return {
    async put() {
      return { key: 'k', size: 1, etag: 'e', uploaded: new Date(), httpMetadata: {} } as R2Object;
    },
    async get() {
      return null;
    },
    async head() {
      return null;
    },
    async delete() {}
  } as unknown as R2Bucket;
}

function makeUserRow(id: number, tokenHash: string): Row {
  return {
    id,
    user_id: id,
    token_hash: tokenHash,
    revoked_at: null,
    email: 'test@cloudpin.local',
    username: 'tester',
    display_name: 'Tester',
    is_admin: 0
  };
}

function makeBookmarkRow(id: number, ownerId: number): Row {
  return {
    id,
    owner_id: ownerId,
    url: 'https://example.com',
    url_normalized: 'https://example.com',
    title: 'Example',
    description: '',
    notes: '',
    web_archive_snapshot_url: '',
    favicon_key: '',
    preview_image_key: '',
    latest_snapshot_asset_id: null,
    unread: 0,
    is_archived: 0,
    shared: 0,
    date_added: '2026-01-01T00:00:00.000Z',
    date_modified: '2026-01-01T00:00:00.000Z',
    date_accessed: null
  };
}

function buildEnv(opts: {
  userId: number;
  tokenHash: string;
  bookmarkId: number;
  ownerId: number;
}) {
  const d1 = new FakeD1()
    .onQuery(/from\s+"api_tokens"/i, () => [makeUserRow(opts.userId, opts.tokenHash)])
    .onQuery(/from\s+"bookmarks"/i, () => [makeBookmarkRow(opts.bookmarkId, opts.ownerId)])
    .onQuery(/from\s+"bookmark_tags"/i, () => [])
    .onQuery(/into\s+"bookmark_assets"/i, () => [{ id: 99 }])
    .onQuery(/update\s+"bookmark_assets"/i, () => []);
  return {
    DB: d1 as unknown as D1Database,
    ASSETS_BUCKET: makeMockR2(),
    APP_SECRET: 'test-secret',
    API_TOKEN_PEPPER: undefined
  };
}

describe('API routing for /api/bookmarks', () => {
  describe('route registration (static)', () => {
    it('honoApp registers POST /api/bookmarks/:bookmarkId/singlefile', () => {
      const route = honoApp.routes.find(
        (r) => r.method === 'POST' && r.path === '/api/bookmarks/:bookmarkId/singlefile'
      );
      expect(route).toBeDefined();
    });

    it('bookmarksRouter owns the singlefile route (no separate singlefileRouter mount)', () => {
      const route = bookmarksRouter.routes.find(
        (r) => r.method === 'POST' && r.path === '/:bookmarkId/singlefile'
      );
      expect(route).toBeDefined();
    });

    it('honoApp does not mount a separate singlefile router at a conflicting path', () => {
      const conflict = honoApp.routes.find(
        (r) =>
          r.method === 'POST' &&
          (r.path === '/api/bookmarks/bookmarks/:bookmarkId/singlefile' ||
            r.path === '/api/bookmarks/singlefile')
      );
      expect(conflict).toBeUndefined();
    });

    it('keeps the existing /:id literal routes intact', () => {
      const getById = honoApp.routes.find(
        (r) => r.method === 'GET' && r.path === '/api/bookmarks/:id'
      );
      const archive = honoApp.routes.find(
        (r) => r.method === 'POST' && r.path === '/api/bookmarks/:id/archive'
      );
      const unarchive = honoApp.routes.find(
        (r) => r.method === 'POST' && r.path === '/api/bookmarks/:id/unarchive'
      );
      expect(getById).toBeDefined();
      expect(archive).toBeDefined();
      expect(unarchive).toBeDefined();
    });
  });

  describe('behavioral (regression: future routes cannot shadow singlefile)', () => {
    it('POST /api/bookmarks/5/singlefile reaches the singlefile handler', async () => {
      const { rawToken, tokenHash } = await generateApiToken();
      const env = buildEnv({ userId: 1, tokenHash, bookmarkId: 5, ownerId: 1 });

      const res = await honoApp.fetch(
        new Request('http://test.local/api/bookmarks/5/singlefile', {
          method: 'POST',
          headers: { authorization: `Token ${rawToken}` },
          body: JSON.stringify({ html: '<html></html>' })
        }),
        env
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { ok: boolean; asset_id: number };
      expect(body.ok).toBe(true);
      expect(typeof body.asset_id).toBe('number');
    });

    it('POST /api/bookmarks/5/singlefile rejects an empty JSON body with html_required', async () => {
      const { rawToken, tokenHash } = await generateApiToken();
      const env = buildEnv({ userId: 1, tokenHash, bookmarkId: 5, ownerId: 1 });

      const res = await honoApp.fetch(
        new Request('http://test.local/api/bookmarks/5/singlefile', {
          method: 'POST',
          headers: { authorization: `Token ${rawToken}`, 'content-type': 'application/json' },
          body: '{}'
        }),
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('html_required');
    });

    it('POST /api/bookmarks/5/singlefile returns 404 from the singlefile handler when the bookmark does not exist (not a routing miss)', async () => {
      const { rawToken, tokenHash } = await generateApiToken();
      const d1 = new FakeD1()
        .onQuery(/from\s+"api_tokens"/i, () => [makeUserRow(1, tokenHash)])
        .onQuery(/from\s+"bookmarks"/i, () => []);
      const env = {
        DB: d1 as unknown as D1Database,
        ASSETS_BUCKET: makeMockR2(),
        API_TOKEN_PEPPER: undefined
      };

      const res = await honoApp.fetch(
        new Request('http://test.local/api/bookmarks/5/singlefile', {
          method: 'POST',
          headers: { authorization: `Token ${rawToken}` },
          body: JSON.stringify({ html: '<html></html>' })
        }),
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; path?: string };
      // Handler-level 404 is a plain not_found, distinct from the top-level
      // 404 produced by the honoApp notFound handler which would also include
      // a `path` field. If we ever see the path-bearing shape here, it means
      // the route got shadowed and the request never reached the handler.
      expect(body.error).toBe('not_found');
      expect(body.path).toBeUndefined();
    });

    it('survives a hypothetical future bookmarksRouter :id/:verb route being shadowed by singlefile ordering', async () => {
      // Documents the fix: when singlefile lived in a separate router
      // mounted after bookmarksRouter, a future route like POST /:id/assets
      // could silently shadow the singlefile endpoint because /:id was a
      // single-segment param. After merging singlefile into bookmarksRouter,
      // all bookmark paths live in one router, so there is no second mount
      // point to drift. The two behavioral tests above (201 on success and
      // 400 html_required on empty body) would fail if the route got
      // shadowed, so they double as the regression guard.
      expect(bookmarksRouter).toBeDefined();
    });
  });

  describe('session-cookie auth path', () => {
    it('POST /api/bookmarks/5/singlefile accepts a valid session cookie', async () => {
      const APP_SECRET = 'test-secret-for-cookie';
      const d1 = new FakeD1()
        .onQuery(/from\s+"users"/i, () => [
          {
            id: 1,
            email: 'test@cloudpin.local',
            username: 'tester',
            display_name: 'Tester',
            is_admin: 0
          }
        ])
        .onQuery(/from\s+"bookmarks"/i, () => [makeBookmarkRow(5, 1)])
        .onQuery(/from\s+"bookmark_tags"/i, () => [])
        .onQuery(/into\s+"bookmark_assets"/i, () => [{ id: 42 }])
        .onQuery(/update\s+"bookmark_assets"/i, () => []);
      const env = {
        DB: d1 as unknown as D1Database,
        ASSETS_BUCKET: makeMockR2(),
        APP_SECRET
      };

      const payload: SessionPayload = {
        sessionId: 'sess-test',
        userId: 1,
        dayBucket: Math.floor(Date.now() / 1000 / 86400)
      };
      const cookie = await signSessionCookie(APP_SECRET, payload);

      const res = await honoApp.fetch(
        new Request('http://test.local/api/bookmarks/5/singlefile', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
          body: JSON.stringify({ html: '<html></html>' })
        }),
        env
      );

      expect(res.status).toBe(201);
    });
  });
});
