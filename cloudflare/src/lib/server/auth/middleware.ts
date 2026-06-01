import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { apiTokens, users } from '../../../db/schema';
import { extractBearerToken, validateTokenShape, hashApiToken, safeEqualHash } from './api-token';
import { AccessJwtValidator, isAccessJwtError } from './access-jwt';
import { SESSION_COOKIE_NAME, verifySessionCookie } from './session';
import { CSRF_HEADER, CSRF_FORM_FIELD, verifyCsrfToken } from './csrf';
import { upsertUserFromAccess } from './user-upsert';
import type { AccessIdentity, AuthState, SessionUser } from './types';

export type AuthEnv = {
  DB: D1Database;
  APP_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  API_TOKEN_PEPPER?: string;
};

export type AuthResolveInput = {
  request: Request;
  env: AuthEnv;
  devIdentity?: AccessIdentity;
  allowDevBypass?: boolean;
};

export type AuthResolveResult = {
  state: AuthState;
  requestId: string;
  origin: string | null;
  isMutation: boolean;
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export function getRequestId(headers: Headers): string {
  return (
    headers.get('cf-ray') ??
    headers.get('x-request-id') ??
    `req-${Math.random().toString(36).slice(2, 12)}`
  );
}

export function getOrigin(headers: Headers): string | null {
  return headers.get('origin');
}

function getCookie(headers: Headers, name: string): string | null {
  const cookie = headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function defaultDevIdentity(): AccessIdentity {
  return {
    email: 'dev@cloudpin.local',
    subject: 'dev-subject',
    issuer: 'https://dev.cloudpin.local',
    audience: 'dev-aud',
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };
}

export async function resolveAuth(input: AuthResolveInput): Promise<AuthResolveResult> {
  const { request, env } = input;
  const headers = request.headers;
  const method = request.method.toUpperCase();
  const isMutation = isMutationMethod(method);
  const requestId = getRequestId(headers);
  const origin = getOrigin(headers);

  const bearer = extractBearerToken(headers.get('authorization'));
  if (bearer && validateTokenShape(bearer)) {
    const user = await resolveApiToken(env.DB, bearer, env.API_TOKEN_PEPPER);
    if (user) {
      return {
        state: { kind: 'api_token', user: user.user, tokenId: user.tokenId },
        requestId,
        origin,
        isMutation
      };
    }
  }

  const validator = new AccessJwtValidator({
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    devIdentity: input.allowDevBypass ? (input.devIdentity ?? defaultDevIdentity()) : undefined
  });
  const jwtHeader = headers.get('cf-access-jwt-assertion');
  if (validator.isDevMode() || jwtHeader) {
    try {
      const identity = await validator.validate(jwtHeader);
      const upsert = await upsertUserFromAccess(env.DB, identity, env.ADMIN_EMAILS);
      const user = await loadSessionUserById(env.DB, upsert.userId);
      if (user) {
        return {
          state: { kind: 'browser_session', user, sessionId: 'access' },
          requestId,
          origin,
          isMutation
        };
      }
    } catch (err) {
      if (!isAccessJwtError(err)) throw err;
    }
  }

  if (env.APP_SECRET) {
    const cookie = getCookie(headers, SESSION_COOKIE_NAME);
    if (cookie) {
      const payload = await verifySessionCookie(env.APP_SECRET, cookie);
      if (payload) {
        const user = await loadSessionUserById(env.DB, payload.userId);
        if (user) {
          return {
            state: { kind: 'browser_session', user, sessionId: payload.sessionId },
            requestId,
            origin,
            isMutation
          };
        }
      }
    }
  }

  return {
    state: { kind: 'unauthenticated' },
    requestId,
    origin,
    isMutation
  };
}

export type CsrfCheckInput = {
  env: AuthEnv;
  state: AuthState;
  request: Request;
  origin: string | null;
};

export type CsrfCheckResult =
  | { ok: true }
  | { ok: false; reason: 'no_session' | 'invalid_token' | 'invalid_origin' | 'no_app_secret' };

export async function checkCsrf(input: CsrfCheckInput): Promise<CsrfCheckResult> {
  if (!input.env.APP_SECRET) return { ok: false, reason: 'no_app_secret' };
  if (input.state.kind !== 'browser_session') return { ok: false, reason: 'no_session' };

  const method = input.request.method.toUpperCase();
  if (!isMutationMethod(method)) return { ok: true };

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(input.request.url).origin;
  } catch {
    return { ok: false, reason: 'invalid_origin' };
  }
  const origin = input.origin;
  if (origin && origin !== expectedOrigin) return { ok: false, reason: 'invalid_origin' };

  const headerToken = input.request.headers.get(CSRF_HEADER);
  let formToken: string | null = null;
  if (!headerToken) {
    const ct = input.request.headers.get('content-type') ?? '';
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      try {
        const form = await input.request.clone().formData();
        const v = form.get(CSRF_FORM_FIELD);
        if (typeof v === 'string') formToken = v;
      } catch {
        formToken = null;
      }
    }
  }
  const token = headerToken ?? formToken;
  if (!token) return { ok: false, reason: 'invalid_token' };

  const ok = await verifyCsrfToken(
    input.env.APP_SECRET,
    {
      userId: input.state.user.id,
      sessionId: input.state.sessionId,
      dayBucket: Math.floor(Date.now() / 1000 / 86400),
      nonce: 'ui'
    },
    token
  );
  if (!ok) return { ok: false, reason: 'invalid_token' };
  return { ok: true };
}

type ApiTokenResolve = { user: SessionUser; tokenId: number };

async function resolveApiToken(
  d1: D1Database,
  rawToken: string,
  pepper: string | undefined
): Promise<ApiTokenResolve | null> {
  const hash = await hashApiToken(rawToken, pepper);
  const db = getDb(d1);
  const rows = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      tokenHash: apiTokens.tokenHash,
      revokedAt: apiTokens.revokedAt,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId));
  for (const row of rows) {
    if (row.revokedAt) continue;
    if (await safeEqualHash(row.tokenHash, hash)) {
      return {
        tokenId: row.id,
        user: {
          id: row.userId,
          email: row.email,
          username: row.username,
          displayName: row.displayName,
          isAdmin: row.isAdmin
        }
      };
    }
  }
  return null;
}

async function loadSessionUserById(d1: D1Database, userId: number): Promise<SessionUser | null> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    displayName: r.displayName,
    isAdmin: r.isAdmin
  };
}
