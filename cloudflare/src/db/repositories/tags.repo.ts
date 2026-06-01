import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { tags } from '../schema';
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
