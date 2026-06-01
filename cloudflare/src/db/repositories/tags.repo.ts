import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { tags, bookmarkTags } from '../schema';
import { normalizeTagName } from '../../domain/tags';

export type TagRow = {
  id: number;
  name: string;
  date_added: string;
};

export async function listTags(
  d1: D1Database,
  ownerId: number,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ items: TagRow[]; total: number }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const countRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(tags)
    .where(eq(tags.ownerId, ownerId));
  const total = Number(countRows[0]?.c ?? 0);
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .orderBy(asc(tags.name))
    .limit(limit)
    .offset(offset);
  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, date_added: r.dateAdded })),
    total
  };
}

export async function getTagById(
  d1: D1Database,
  ownerId: number,
  id: number
): Promise<TagRow | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.id, id)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, date_added: r.dateAdded };
}

export async function findTagByName(
  d1: D1Database,
  ownerId: number,
  name: string
): Promise<TagRow | null> {
  const normalized = normalizeTagName(name);
  if (!normalized) return null;
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.nameNormalized, normalized)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, date_added: r.dateAdded };
}

export type CreateTagResult = { id: number; created: boolean; name: string };

export async function createTag(
  d1: D1Database,
  ownerId: number,
  name: string
): Promise<CreateTagResult> {
  const normalized = normalizeTagName(name);
  if (!normalized) throw new Error('Tag name is empty after normalization');
  const db = getDb(d1);
  const existing = await findTagByName(d1, ownerId, name);
  if (existing) return { id: existing.id, created: false, name: existing.name };
  const inserted = await db
    .insert(tags)
    .values({
      ownerId,
      name,
      nameNormalized: normalized,
      dateAdded: new Date().toISOString()
    })
    .returning({ id: tags.id });
  return { id: inserted[0]!.id, created: true, name };
}

export async function deleteTag(d1: D1Database, ownerId: number, id: number): Promise<boolean> {
  const db = getDb(d1);
  const result = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId)))
    .returning({ id: tags.id });
  return result.length > 0;
}

export type RenameTagResult = { id: number; name: string; merged: boolean };

export async function renameTag(
  d1: D1Database,
  ownerId: number,
  id: number,
  newName: string
): Promise<RenameTagResult | null> {
  const normalized = normalizeTagName(newName);
  if (!normalized) throw new Error('Tag name is empty after normalization');
  const db = getDb(d1);
  const current = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId)))
    .limit(1);
  const tag = current[0];
  if (!tag) return null;
  if (tag.nameNormalized === normalized) {
    if (tag.name === newName) return { id: tag.id, name: tag.name, merged: false };
  }
  const conflict = await db
    .select()
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.nameNormalized, normalized)))
    .limit(1);
  const other = conflict[0];
  if (other && other.id !== id) {
    await mergeTags(d1, ownerId, id, other.id);
    return { id: other.id, name: other.name, merged: true };
  }
  await db.update(tags).set({ name: newName, nameNormalized: normalized }).where(eq(tags.id, id));
  return { id, name: newName, merged: false };
}

export async function mergeTags(
  d1: D1Database,
  ownerId: number,
  sourceId: number,
  targetId: number
): Promise<number> {
  if (sourceId === targetId) return 0;
  const db = getDb(d1);
  const sourceLinks = await db
    .select({ bookmarkId: bookmarkTags.bookmarkId })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.tagId, sourceId));
  const targetLinks = await db
    .select({ bookmarkId: bookmarkTags.bookmarkId })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.tagId, targetId));
  const targetSet = new Set(targetLinks.map((r) => r.bookmarkId));
  const toInsert = sourceLinks.map((r) => r.bookmarkId).filter((id) => !targetSet.has(id));

  if (toInsert.length > 0) {
    await db
      .insert(bookmarkTags)
      .values(toInsert.map((bookmarkId) => ({ bookmarkId, tagId: targetId })));
  }
  await db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, sourceId));
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.id, sourceId), eq(tags.ownerId, ownerId)))
    .returning({ id: tags.id });
  void ownerId;
  return deleted.length > 0 ? toInsert.length : 0;
}

export type TagWithCount = TagRow & { bookmark_count: number };

export async function listTagsWithCounts(d1: D1Database, ownerId: number): Promise<TagWithCount[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      date_added: tags.dateAdded,
      bookmark_count:
        sql<number>`(SELECT COUNT(*) FROM bookmark_tags bt WHERE bt.tag_id = ${tags.id})`.as(
          'bookmark_count'
        )
    })
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .orderBy(asc(tags.name));
  return rows.map((r) => ({ ...r, bookmark_count: Number(r.bookmark_count) }));
}

export type UserProfileRow = {
  user_id: number;
  theme: string;
  bookmark_date_display: string;
  bookmark_description_display: string;
  bookmark_description_max_lines: number;
  bookmark_link_target: string;
  web_archive_integration: string;
  tag_search: string;
  tag_grouping: string;
  enable_sharing: boolean;
  enable_public_sharing: boolean;
  enable_favicons: boolean;
  enable_preview_images: boolean;
  display_url: boolean;
  display_view_bookmark_action: boolean;
  display_edit_bookmark_action: boolean;
  display_archive_bookmark_action: boolean;
  display_remove_bookmark_action: boolean;
  permanent_notes: boolean;
  custom_css: string;
  custom_css_hash: string;
  auto_tagging_rules: string;
  search_preferences: string;
  enable_automatic_html_snapshots: boolean;
  default_mark_unread: boolean;
  default_mark_shared: boolean;
  items_per_page: number;
  sticky_pagination: boolean;
  collapse_side_panel: boolean;
  hide_bundles: boolean;
  legacy_search: boolean;
};

export async function getUserProfile(
  d1: D1Database,
  userId: number
): Promise<UserProfileRow | null> {
  const { userProfiles } = await import('../schema');
  const db = getDb(d1);
  const rows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return (rows[0] as unknown as UserProfileRow) ?? null;
}
