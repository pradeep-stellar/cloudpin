import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { userProfiles } from '../schema';

export type UserProfileRow = typeof userProfiles.$inferSelect;

export async function getUserProfile(
  d1: D1Database,
  userId: number
): Promise<UserProfileRow | null> {
  const db = getDb(d1);
  const rows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertUserProfile(
  d1: D1Database,
  userId: number,
  patch: Partial<Omit<UserProfileRow, 'userId'>>
): Promise<void> {
  const db = getDb(d1);
  const existing = await getUserProfile(d1, userId);
  if (!existing) {
    await db.insert(userProfiles).values({ userId, ...patch } as typeof userProfiles.$inferInsert);
    return;
  }
  if (Object.keys(patch).length === 0) return;
  await db
    .update(userProfiles)
    .set(patch as Partial<typeof userProfiles.$inferInsert>)
    .where(eq(userProfiles.userId, userId));
}
