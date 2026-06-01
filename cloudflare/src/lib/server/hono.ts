import { Hono } from 'hono';

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
};

export const honoApp = new Hono<{ Bindings: Bindings }>();

honoApp.get('/api/health', (c) => c.json({ status: 'ok', service: 'cloudpin' }));

honoApp.notFound((c) => c.json({ error: 'not_found' }, 404));

honoApp.onError((err, c) => {
  console.error('hono error', err);
  return c.json({ error: 'internal_error' }, 500);
});

export type CloudpinHono = typeof honoApp;
