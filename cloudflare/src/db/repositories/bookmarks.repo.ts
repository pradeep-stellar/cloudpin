import type { Bookmark, BookmarkAsset, NewBookmark, NewBookmarkAsset, Tag } from '../../db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { bookmarks, bookmarkTags, tags } from '../schema';
import { normalizeUrl } from '../../domain/url-normalize';
import { normalizeTagName } from '../../domain/tags';
import { parseSearch } from '../../domain/search-parser';
import { compileSearch } from '../../domain/search-sql';

export type BookmarkListItem = {
  id: number;
  url: string;
  title: string;
  description: string;
  notes: string;
  web_archive_snapshot_url: string;
  is_archived: boolean;
  unread: boolean;
  shared: boolean;
  tag_names: string[];
  date_added: string;
  date_modified: string;
  date_accessed: string | null;
  website_title: string | null;
  website_description: string | null;
};

export type BookmarkListOptions = {
  ownerId: number;
  searchQuery?: string;
  archivedFilter?: 'all' | 'true' | 'false' | 'only';
  limit: number;
  offset: number;
};

export type BookmarkListResult = {
  items: BookmarkListItem[];
  total: number;
};

export async function listBookmarks(
  d1: D1Database,
  opts: BookmarkListOptions
): Promise<BookmarkListResult> {
  const db = getDb(d1);
  const conditions: ReturnType<typeof eq>[] = [eq(bookmarks.ownerId, opts.ownerId)];

  if (opts.archivedFilter === 'true' || opts.archivedFilter === 'false') {
    conditions.push(eq(bookmarks.isArchived, opts.archivedFilter === 'true'));
  } else if (opts.archivedFilter === 'only') {
    conditions.push(eq(bookmarks.isArchived, true));
  } else {
    conditions.push(eq(bookmarks.isArchived, false));
  }

  if (opts.searchQuery && opts.searchQuery.trim() !== '') {
    const ast = parseSearch(opts.searchQuery);
    const compiled = compileSearch(ast);
    if (compiled.sql) {
      conditions.push(sql.raw(compiled.sql) as ReturnType<typeof eq>);
    }
  }

  const where = and(...conditions);
  const countRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookmarks)
    .where(where);
  const total = Number(countRows[0]?.c ?? 0);

  const rows = await db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(desc(bookmarks.dateAdded))
    .limit(opts.limit)
    .offset(opts.offset);

  const ids = rows.map((r) => r.id);
  const tagMap = await fetchTagNamesForBookmarks(d1, ids);
  const items = rows.map((r) => toListItem(r, tagMap.get(r.id) ?? []));

  return { items, total };
}

export async function getBookmarkById(
  d1: D1Database,
  ownerId: number,
  id: number
): Promise<BookmarkListItem | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.ownerId, ownerId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const tagMap = await fetchTagNamesForBookmarks(d1, [id]);
  return toListItem(row, tagMap.get(id) ?? []);
}

export async function getBookmarkByIdForAnyOwner(
  d1: D1Database,
  id: number
): Promise<typeof bookmarks.$inferSelect | null> {
  const db = getDb(d1);
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findBookmarkByNormalizedUrl(
  d1: D1Database,
  ownerId: number,
  normalized: string
): Promise<typeof bookmarks.$inferSelect | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.ownerId, ownerId), eq(bookmarks.urlNormalized, normalized)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateBookmarkInput = {
  ownerId: number;
  url: string;
  title?: string;
  description?: string;
  notes?: string;
  tagNames?: string[];
  isArchived?: boolean;
  unread?: boolean;
  shared?: boolean;
};

export type CreateBookmarkResult = {
  id: number;
  created: boolean;
  bookmark: typeof bookmarks.$inferSelect;
};

export async function createBookmark(
  d1: D1Database,
  input: CreateBookmarkInput
): Promise<CreateBookmarkResult> {
  const db = getDb(d1);
  const url = input.url;
  const normalized = normalizeUrl(url);

  const existing = await findBookmarkByNormalizedUrl(d1, input.ownerId, normalized);
  if (existing) {
    return { id: existing.id, created: false, bookmark: existing };
  }

  const now = new Date().toISOString();
  const inserted = await db
    .insert(bookmarks)
    .values({
      ownerId: input.ownerId,
      url,
      urlNormalized: normalized,
      title: input.title ?? '',
      description: input.description ?? '',
      notes: input.notes ?? '',
      isArchived: input.isArchived ?? false,
      unread: input.unread ?? false,
      shared: input.shared ?? false,
      dateAdded: now,
      dateModified: now
    })
    .returning();
  const bookmark = inserted[0];
  if (!bookmark) throw new Error('Failed to insert bookmark');

  if (input.tagNames && input.tagNames.length > 0) {
    await setBookmarkTags(d1, bookmark.id, input.ownerId, input.tagNames);
  }

  return { id: bookmark.id, created: true, bookmark };
}

export type UpdateBookmarkInput = {
  ownerId: number;
  id: number;
  patch: {
    url?: string;
    title?: string;
    description?: string;
    notes?: string;
    isArchived?: boolean;
    unread?: boolean;
    shared?: boolean;
  };
};

export async function updateBookmark(
  d1: D1Database,
  input: UpdateBookmarkInput
): Promise<typeof bookmarks.$inferSelect | null> {
  const db = getDb(d1);
  const existing = await getBookmarkById(d1, input.ownerId, input.id);
  if (!existing) return null;

  const updates: Partial<typeof bookmarks.$inferInsert> = {
    dateModified: new Date().toISOString()
  };
  if (input.patch.url !== undefined) {
    const normalized = normalizeUrl(input.patch.url);
    const conflict = await findBookmarkByNormalizedUrl(d1, input.ownerId, normalized);
    if (conflict && conflict.id !== input.id) {
      throw new DuplicateUrlError();
    }
    updates.url = input.patch.url;
    updates.urlNormalized = normalized;
  }
  if (input.patch.title !== undefined) updates.title = input.patch.title;
  if (input.patch.description !== undefined) updates.description = input.patch.description;
  if (input.patch.notes !== undefined) updates.notes = input.patch.notes;
  if (input.patch.isArchived !== undefined) updates.isArchived = input.patch.isArchived;
  if (input.patch.unread !== undefined) updates.unread = input.patch.unread;
  if (input.patch.shared !== undefined) updates.shared = input.patch.shared;

  await db.update(bookmarks).set(updates).where(eq(bookmarks.id, input.id));
  return getBookmarkByIdForAnyOwner(d1, input.id);
}

export async function deleteBookmark(
  d1: D1Database,
  ownerId: number,
  id: number
): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.ownerId, ownerId)))
    .returning({ id: bookmarks.id });
  return result.length > 0;
}

export async function setBookmarkArchive(
  d1: D1Database,
  ownerId: number,
  id: number,
  archive: boolean
): Promise<typeof bookmarks.$inferSelect | null> {
  const db = getDb(d1);
  const existing = await getBookmarkById(d1, ownerId, id);
  if (!existing) return null;
  await db
    .update(bookmarks)
    .set({ isArchived: archive, dateModified: new Date().toISOString() })
    .where(eq(bookmarks.id, id));
  return getBookmarkByIdForAnyOwner(d1, id);
}

export class DuplicateUrlError extends Error {
  constructor() {
    super('Another bookmark with the same URL already exists');
    this.name = 'DuplicateUrlError';
  }
}

async function fetchTagNamesForBookmarks(
  d1: D1Database,
  bookmarkIds: number[]
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (bookmarkIds.length === 0) return out;
  const db = getDb(d1);
  const rows = await db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      name: tags.name
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
    .where(inArray(bookmarkTags.bookmarkId, bookmarkIds));
  for (const r of rows) {
    const list = out.get(r.bookmarkId) ?? [];
    list.push(r.name);
    out.set(r.bookmarkId, list);
  }
  return out;
}

async function setBookmarkTags(
  d1: D1Database,
  bookmarkId: number,
  ownerId: number,
  tagNames: string[]
): Promise<void> {
  const db = getDb(d1);
  const normalizedToName = new Map<string, string>();
  for (const name of tagNames) {
    const norm = normalizeTagName(name);
    if (!norm) continue;
    if (!normalizedToName.has(norm)) normalizedToName.set(norm, name);
  }
  if (normalizedToName.size === 0) {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
    return;
  }

  const tagRows = await db
    .select()
    .from(tags)
    .where(
      and(eq(tags.ownerId, ownerId), inArray(tags.nameNormalized, [...normalizedToName.keys()]))
    );

  const existingNorm = new Set(tagRows.map((t) => t.nameNormalized));
  const toCreate: string[] = [];
  for (const norm of normalizedToName.keys()) {
    if (!existingNorm.has(norm)) toCreate.push(norm);
  }
  if (toCreate.length > 0) {
    const now = new Date().toISOString();
    await db.insert(tags).values(
      toCreate.map((norm) => ({
        ownerId,
        name: normalizedToName.get(norm) ?? norm,
        nameNormalized: norm,
        dateAdded: now
      }))
    );
  }

  const allTags = await db
    .select()
    .from(tags)
    .where(
      and(eq(tags.ownerId, ownerId), inArray(tags.nameNormalized, [...normalizedToName.keys()]))
    );

  await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
  if (allTags.length > 0) {
    await db.insert(bookmarkTags).values(allTags.map((t) => ({ bookmarkId, tagId: t.id })));
  }
}

function toListItem(row: typeof bookmarks.$inferSelect, tagNames: string[]): BookmarkListItem {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    notes: row.notes,
    web_archive_snapshot_url: row.webArchiveSnapshotUrl,
    is_archived: row.isArchived,
    unread: row.unread,
    shared: row.shared,
    tag_names: tagNames,
    date_added: row.dateAdded,
    date_modified: row.dateModified,
    date_accessed: row.dateAccessed,
    website_title: null,
    website_description: null
  };
}

export type BulkUpdateFields = {
  isArchived?: boolean;
  unread?: boolean;
  shared?: boolean;
};

export async function bulkUpdateBookmarks(
  d1: D1Database,
  ownerId: number,
  ids: number[],
  fields: BulkUpdateFields
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb(d1);
  const update: Partial<typeof bookmarks.$inferInsert> = {
    dateModified: new Date().toISOString()
  };
  if (fields.isArchived !== undefined) update.isArchived = fields.isArchived;
  if (fields.unread !== undefined) update.unread = fields.unread;
  if (fields.shared !== undefined) update.shared = fields.shared;
  const result = await db
    .update(bookmarks)
    .set(update)
    .where(and(eq(bookmarks.ownerId, ownerId), inArray(bookmarks.id, ids)))
    .returning({ id: bookmarks.id });
  return result.length;
}

export async function bulkDeleteBookmarks(
  d1: D1Database,
  ownerId: number,
  ids: number[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb(d1);
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.ownerId, ownerId), inArray(bookmarks.id, ids)))
    .returning({ id: bookmarks.id });
  return result.length;
}

export async function bulkAddTag(
  d1: D1Database,
  ownerId: number,
  ids: number[],
  tagName: string
): Promise<{ addedBookmarkCount: number; tagId: number }> {
  if (ids.length === 0) return { addedBookmarkCount: 0, tagId: 0 };
  const normalized = normalizeTagName(tagName);
  if (!normalized) return { addedBookmarkCount: 0, tagId: 0 };
  const db = getDb(d1);
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.nameNormalized, normalized)))
    .limit(1);
  let tagId: number;
  if (existing[0]) {
    tagId = existing[0].id;
  } else {
    const inserted = await db
      .insert(tags)
      .values({
        ownerId,
        name: tagName.trim(),
        nameNormalized: normalized,
        dateAdded: new Date().toISOString()
      })
      .returning({ id: tags.id });
    const r = inserted[0];
    if (!r) throw new Error('Failed to insert tag');
    tagId = r.id;
  }

  const existingLinks = await db
    .select({ bookmarkId: bookmarkTags.bookmarkId })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.tagId, tagId), inArray(bookmarkTags.bookmarkId, ids)));
  const alreadyLinked = new Set(existingLinks.map((r) => r.bookmarkId));
  const toInsert = ids.filter((id) => !alreadyLinked.has(id));
  if (toInsert.length === 0) {
    return { addedBookmarkCount: 0, tagId };
  }
  await db.insert(bookmarkTags).values(toInsert.map((bookmarkId) => ({ bookmarkId, tagId })));
  await db
    .update(bookmarks)
    .set({ dateModified: new Date().toISOString() })
    .where(inArray(bookmarks.id, toInsert));
  return { addedBookmarkCount: toInsert.length, tagId };
}

export async function bulkRemoveTag(
  d1: D1Database,
  ownerId: number,
  ids: number[],
  tagName: string
): Promise<number> {
  if (ids.length === 0) return 0;
  const normalized = normalizeTagName(tagName);
  if (!normalized) return 0;
  const db = getDb(d1);
  const tag = await db
    .select()
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.nameNormalized, normalized)))
    .limit(1);
  const tagRow = tag[0];
  if (!tagRow) return 0;
  const result = await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.tagId, tagRow.id), inArray(bookmarkTags.bookmarkId, ids)))
    .returning({ bookmarkId: bookmarkTags.bookmarkId });
  if (result.length > 0) {
    const removedIds = result.map((r) => r.bookmarkId);
    await db
      .update(bookmarks)
      .set({ dateModified: new Date().toISOString() })
      .where(inArray(bookmarks.id, removedIds));
  }
  return result.length;
}

export type { Bookmark, BookmarkAsset, NewBookmark, NewBookmarkAsset, Tag };
