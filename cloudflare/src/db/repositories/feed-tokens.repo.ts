import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { feedTokens, users } from '../schema';
import { hashApiToken } from '../../lib/server/auth/api-token';

export type FeedTokenRow = {
  userId: number;
  createdAt: string;
};

export async function getFeedToken(d1: D1Database, userId: number): Promise<FeedTokenRow | null> {
  const db = getDb(d1);
  const rows = await db.select().from(feedTokens).where(eq(feedTokens.userId, userId)).limit(1);
  return rows[0]
    ? {
        userId: rows[0].userId,
        createdAt: rows[0].createdAt
      }
    : null;
}

export type RotateResult = { rawToken: string; createdAt: string };

export async function rotateFeedToken(d1: D1Database, userId: number): Promise<RotateResult> {
  const raw = generateRaw();
  const hash = await hashApiToken(raw, '');
  const now = new Date().toISOString();
  const db = getDb(d1);
  const existing = await getFeedToken(d1, userId);
  if (existing) {
    await db
      .update(feedTokens)
      .set({ tokenHash: hash, createdAt: now })
      .where(eq(feedTokens.userId, userId));
  } else {
    await db.insert(feedTokens).values({ userId, tokenHash: hash, createdAt: now });
  }
  return { rawToken: raw, createdAt: now };
}

export async function deleteFeedToken(d1: D1Database, userId: number): Promise<void> {
  const db = getDb(d1);
  await db.delete(feedTokens).where(eq(feedTokens.userId, userId));
}

export type ResolvedFeedUser = {
  id: number;
  email: string;
  username: string;
  isAdmin: boolean;
};

export async function resolveFeedToken(
  d1: D1Database,
  rawToken: string
): Promise<ResolvedFeedUser | null> {
  if (!rawToken) return null;
  const hash = await hashApiToken(rawToken, '');
  const db = getDb(d1);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      isAdmin: users.isAdmin
    })
    .from(feedTokens)
    .innerJoin(users, eq(users.id, feedTokens.userId))
    .where(eq(feedTokens.tokenHash, hash))
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

void and;
