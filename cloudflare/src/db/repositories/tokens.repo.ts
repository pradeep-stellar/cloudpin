import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { apiTokens, users } from '../schema';
import { hashApiToken, safeEqualHash } from '../../lib/server/auth/api-token';

export type ApiTokenRow = {
  id: number;
  userId: number;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreateTokenInput = {
  userId: number;
  name: string;
  pepper?: string;
};

export type CreateTokenResult = {
  id: number;
  rawToken: string;
  tokenPrefix: string;
  createdAt: string;
};

export async function listTokensForUser(d1: D1Database, userId: number): Promise<ApiTokenRow[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
  return rows;
}

export async function createToken(
  d1: D1Database,
  input: CreateTokenInput
): Promise<CreateTokenResult> {
  const db = getDb(d1);
  const raw = generateRaw();
  const hash = await hashApiToken(raw, input.pepper);
  const prefix = raw.slice(0, 6);
  const inserted = await db
    .insert(apiTokens)
    .values({
      userId: input.userId,
      name: input.name,
      tokenHash: hash,
      tokenPrefix: prefix
    })
    .returning({
      id: apiTokens.id,
      createdAt: apiTokens.createdAt
    });
  const row = inserted[0];
  if (!row) throw new Error('Failed to insert API token');
  return { id: row.id, rawToken: raw, tokenPrefix: prefix, createdAt: row.createdAt };
}

export async function revokeToken(
  d1: D1Database,
  userId: number,
  tokenId: number
): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .update(apiTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt))
    )
    .returning({ id: apiTokens.id });
  return result.length > 0;
}

export type ResolvedToken = {
  id: number;
  userId: number;
};

export async function resolveToken(
  d1: D1Database,
  rawToken: string,
  pepper: string = ''
): Promise<ResolvedToken | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const hash = await hashApiToken(rawToken, pepper);
  const db = getDb(d1);
  const rows = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      tokenHash: apiTokens.tokenHash,
      revokedAt: apiTokens.revokedAt
    })
    .from(apiTokens)
    .where(isNull(apiTokens.revokedAt));
  for (const row of rows) {
    if (await safeEqualHash(row.tokenHash, hash)) {
      return { id: row.id, userId: row.userId };
    }
  }
  return null;
}

export async function touchToken(d1: D1Database, tokenId: number): Promise<void> {
  const db = getDb(d1);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, tokenId));
}

export type SessionUserRow = {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
};

export async function loadSessionUser(
  d1: D1Database,
  userId: number
): Promise<SessionUserRow | null> {
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
  return rows[0] ?? null;
}

function generateRaw(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function toBase64Url(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i] ?? 0);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
