import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { users } from '../schema';

export type UserRow = {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export async function findUserById(d1: D1Database, id: number): Promise<UserRow | null> {
  const db = getDb(d1);
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(d1: D1Database, email: string): Promise<UserRow | null> {
  const db = getDb(d1);
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function setLastLogin(d1: D1Database, userId: number): Promise<void> {
  const db = getDb(d1);
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, userId));
}
