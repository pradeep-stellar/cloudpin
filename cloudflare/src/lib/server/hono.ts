import { Hono } from 'hono';
import { resolveAuth } from './auth/middleware';
import { bookmarksRouter } from '$server/api/bookmarks.routes';
import { tagsRouter } from '$server/api/tags.routes';
import { profileRouter } from '$server/api/profile.routes';
import { assetsRouter } from '$server/api/assets.routes';
import { singlefileRouter } from '$server/api/singlefile.routes';

type Bindings = {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  JOBS: Queue;
  BROWSER?: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  PUBLIC_BASE_URL?: string;
  FAVICON_PROVIDER?: string;
  APP_SECRET?: string;
  API_TOKEN_PEPPER?: string;
};

type AuthUser = {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
};

type ApiEnv = {
  Bindings: Bindings;
  Variables: {
    user: AuthUser;
    authKind: 'api_token' | 'browser_session';
    tokenId?: number;
  };
};

export const honoApp = new Hono<ApiEnv>();

honoApp.use('*', async (c, next) => {
  const resolved = await resolveAuth({
    request: c.req.raw,
    env: c.env,
    allowDevBypass: false
  });
  if (resolved.state.kind === 'api_token') {
    c.set('user', resolved.state.user);
    c.set('authKind', 'api_token');
    c.set('tokenId', resolved.state.tokenId);
  } else if (resolved.state.kind === 'browser_session') {
    c.set('user', resolved.state.user);
    c.set('authKind', 'browser_session');
  }
  await next();
});

honoApp.get('/api/health', (c) =>
  c.json({ status: 'ok', service: 'cloudpin', ts: new Date().toISOString() })
);

honoApp.use('/api/bookmarks/*', async (c, next) => {
  const u = c.get('user');
  if (!u || !u.id) return c.json({ error: 'unauthenticated' }, 401);
  await next();
});

honoApp.route('/api/bookmarks', bookmarksRouter);
honoApp.route('/api', assetsRouter);
honoApp.route('/api/bookmarks', singlefileRouter);
honoApp.route('/api/tags', tagsRouter);
honoApp.route('/api/user', profileRouter);

honoApp.notFound((c) => c.json({ error: 'not_found', path: new URL(c.req.url).pathname }, 404));

honoApp.onError((err, c) => {
  console.error('hono error', err);
  return c.json({ error: 'internal_error' }, 500);
});

export type CloudpinHono = typeof honoApp;
