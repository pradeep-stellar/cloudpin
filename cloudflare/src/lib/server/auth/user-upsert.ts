import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { userProfiles, users } from '../../../db/schema';
import type { AccessIdentity } from './types';

export type UpsertResult = {
  userId: number;
  created: boolean;
  isAdmin: boolean;
};

function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  );
}

function usernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(0, 64) || 'user';
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function upsertUserFromAccess(
  d1: D1Database,
  identity: AccessIdentity,
  adminEmailsRaw: string | undefined
): Promise<UpsertResult> {
  const db = getDb(d1);
  const email = identity.email.toLowerCase();
  const adminEmails = parseAdminEmails(adminEmailsRaw);
  const isAdmin = adminEmails.has(email);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const found = existing[0];

  if (found) {
    await db
      .update(users)
      .set({
        accessSubject: identity.subject,
        lastLoginAt: nowIso(),
        isAdmin
      })
      .where(eq(users.id, found.id));
    return { userId: found.id, created: false, isAdmin };
  }

  let username = usernameFromEmail(email);
  for (let attempt = 0; attempt < 25; attempt++) {
    const collision = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (collision.length === 0) break;
    username = `${usernameFromEmail(email)}-${Math.floor(Math.random() * 10000)}`;
  }

  const inserted = await db
    .insert(users)
    .values({
      email,
      username,
      accessSubject: identity.subject,
      isAdmin,
      createdAt: nowIso(),
      lastLoginAt: nowIso()
    })
    .returning({ id: users.id });
  const userId = inserted[0]?.id;
  if (userId === undefined) {
    throw new Error('Failed to insert user');
  }

  await db
    .insert(userProfiles)
    .values({
      userId
    })
    .onConflictDoNothing();

  return { userId, created: true, isAdmin };
}
