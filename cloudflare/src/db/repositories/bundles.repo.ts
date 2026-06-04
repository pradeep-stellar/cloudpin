import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { bookmarkBundles } from '../schema';

export type BundleRow = {
  id: number;
  name: string;
  search: string;
  any_tags: string;
  all_tags: string;
  excluded_tags: string;
  filter_unread: 'yes' | 'no' | 'off';
  filter_shared: 'yes' | 'no' | 'off';
  sort_order: number;
  date_created: string;
  date_modified: string;
};

export async function listBundles(d1: D1Database, ownerId: number): Promise<BundleRow[]> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarkBundles)
    .where(eq(bookmarkBundles.ownerId, ownerId))
    .orderBy(asc(bookmarkBundles.sortOrder), asc(bookmarkBundles.id));
  return rows.map(toBundleRow);
}

export async function getBundle(
  d1: D1Database,
  ownerId: number,
  id: number
): Promise<BundleRow | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarkBundles)
    .where(and(eq(bookmarkBundles.id, id), eq(bookmarkBundles.ownerId, ownerId)))
    .limit(1);
  const r = rows[0];
  return r ? toBundleRow(r) : null;
}

export type CreateBundleInput = Omit<
  BundleRow,
  'id' | 'date_created' | 'date_modified' | 'sort_order'
> & { sort_order?: number };

export async function createBundle(
  d1: D1Database,
  ownerId: number,
  input: CreateBundleInput
): Promise<number> {
  const db = getDb(d1);
  const now = new Date().toISOString();
  const maxOrder = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
    .from(bookmarkBundles)
    .where(eq(bookmarkBundles.ownerId, ownerId));
  const nextOrder = (Number(maxOrder[0]?.max ?? 0) || 0) + 1;
  const inserted = await db
    .insert(bookmarkBundles)
    .values({
      ownerId,
      name: input.name,
      search: input.search,
      anyTags: input.any_tags,
      allTags: input.all_tags,
      excludedTags: input.excluded_tags,
      filterUnread: input.filter_unread,
      filterShared: input.filter_shared,
      sortOrder: input.sort_order ?? nextOrder,
      dateCreated: now,
      dateModified: now
    })
    .returning({ id: bookmarkBundles.id });
  return inserted[0]!.id;
}

export type UpdateBundleInput = Partial<Omit<CreateBundleInput, 'sort_order'>> & {
  sort_order?: number;
};

export async function updateBundle(
  d1: D1Database,
  ownerId: number,
  id: number,
  patch: UpdateBundleInput
): Promise<boolean> {
  const db = getDb(d1);
  const update: Record<string, unknown> = {
    dateModified: new Date().toISOString()
  };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.search !== undefined) update.search = patch.search;
  if (patch.any_tags !== undefined) update.anyTags = patch.any_tags;
  if (patch.all_tags !== undefined) update.allTags = patch.all_tags;
  if (patch.excluded_tags !== undefined) update.excludedTags = patch.excluded_tags;
  if (patch.filter_unread !== undefined) update.filterUnread = patch.filter_unread;
  if (patch.filter_shared !== undefined) update.filterShared = patch.filter_shared;
  if (patch.sort_order !== undefined) update.sortOrder = patch.sort_order;
  const result = await db
    .update(bookmarkBundles)
    .set(update)
    .where(and(eq(bookmarkBundles.id, id), eq(bookmarkBundles.ownerId, ownerId)))
    .returning({ id: bookmarkBundles.id });
  return result.length > 0;
}

export async function deleteBundle(d1: D1Database, ownerId: number, id: number): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .delete(bookmarkBundles)
    .where(and(eq(bookmarkBundles.id, id), eq(bookmarkBundles.ownerId, ownerId)))
    .returning({ id: bookmarkBundles.id });
  return result.length > 0;
}

export async function reorderBundles(
  d1: D1Database,
  ownerId: number,
  orderedIds: number[]
): Promise<void> {
  const db = getDb(d1);
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(bookmarkBundles)
      .set({ sortOrder: i + 1, dateModified: now })
      .where(and(eq(bookmarkBundles.id, orderedIds[i]!), eq(bookmarkBundles.ownerId, ownerId)));
  }
}

function toBundleRow(row: typeof bookmarkBundles.$inferSelect): BundleRow {
  return {
    id: row.id,
    name: row.name,
    search: row.search,
    any_tags: row.anyTags,
    all_tags: row.allTags,
    excluded_tags: row.excludedTags,
    filter_unread: row.filterUnread as 'yes' | 'no' | 'off',
    filter_shared: row.filterShared as 'yes' | 'no' | 'off',
    sort_order: row.sortOrder,
    date_created: row.dateCreated,
    date_modified: row.dateModified
  };
}
