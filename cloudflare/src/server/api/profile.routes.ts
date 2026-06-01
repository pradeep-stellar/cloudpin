import { Hono } from 'hono';
import { getUserProfile } from '../../db/repositories/tags.repo';
import { loadSessionUser } from '../../db/repositories/tokens.repo';

type Bindings = {
  DB: D1Database;
  APP_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  API_TOKEN_PEPPER?: string;
  PUBLIC_BASE_URL?: string;
};

type AuthUser = {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
};

type ApiEnv = {
  Bindings: Bindings;
  Variables: { user: AuthUser; authKind: 'api_token' | 'browser_session'; tokenId?: number };
};

export const profileRouter = new Hono<ApiEnv>();

function requireUser(c: { get: (k: 'user') => AuthUser | undefined }): AuthUser {
  const u = c.get('user');
  if (!u) throw new Error('unauthenticated');
  return u as AuthUser;
}

profileRouter.get('/profile', async (c) => {
  const user = requireUser(c);
  const [profile, full] = await Promise.all([
    getUserProfile(c.env.DB, user.id),
    loadSessionUser(c.env.DB, user.id)
  ]);
  return c.json({
    user: full
      ? {
          id: full.id,
          email: full.email,
          username: full.username,
          is_admin: full.isAdmin
        }
      : null,
    profile: profile ?? null
  });
});

profileRouter.onError((err, c) => {
  console.error('profile router error', err);
  return c.json({ error: 'internal_error' }, 500);
});
