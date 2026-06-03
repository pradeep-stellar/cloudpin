import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { bookmarkAssets, bookmarks } from '../schema';
import { normalizeUrl } from '../../domain/url-normalize';

export type AssetRow = typeof bookmarkAssets.$inferSelect;
export type AssetStatus = 'pending' | 'complete' | 'failure';
export type AssetType = 'upload' | 'snapshot' | 'favicon' | 'preview';

export async function createAsset(
  d1: D1Database,
  input: {
    bookmarkId: number;
    assetType: AssetType;
    contentType: string;
    displayName?: string;
    status?: AssetStatus;
    gzip?: boolean;
  }
): Promise<number> {
  const db = getDb(d1);
  const inserted = await db
    .insert(bookmarkAssets)
    .values({
      bookmarkId: input.bookmarkId,
      assetType: input.assetType,
      contentType: input.contentType,
      displayName: input.displayName ?? '',
      status: input.status ?? 'pending',
      gzip: input.gzip ?? false
    })
    .returning({ id: bookmarkAssets.id });
  return inserted[0]!.id;
}

export async function listAssetsForBookmark(
  d1: D1Database,
  ownerId: number,
  bookmarkId: number
): Promise<AssetRow[]> {
  const db = getDb(d1);
  const rows = await db
    .select({ asset: bookmarkAssets })
    .from(bookmarkAssets)
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.bookmarkId))
    .where(and(eq(bookmarks.ownerId, ownerId), eq(bookmarkAssets.bookmarkId, bookmarkId)))
    .orderBy(desc(bookmarkAssets.dateCreated));
  return rows.map((r) => r.asset);
}

export async function getAsset(
  d1: D1Database,
  ownerId: number,
  bookmarkId: number,
  assetId: number
): Promise<AssetRow | null> {
  const db = getDb(d1);
  const rows = await db
    .select({ asset: bookmarkAssets })
    .from(bookmarkAssets)
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.bookmarkId))
    .where(
      and(
        eq(bookmarks.ownerId, ownerId),
        eq(bookmarkAssets.bookmarkId, bookmarkId),
        eq(bookmarkAssets.id, assetId)
      )
    )
    .limit(1);
  return rows[0]?.asset ?? null;
}

export async function getAssetForBookmark(
  d1: D1Database,
  bookmarkId: number,
  assetId: number
): Promise<AssetRow | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarkAssets)
    .where(and(eq(bookmarkAssets.bookmarkId, bookmarkId), eq(bookmarkAssets.id, assetId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPendingAsset(
  d1: D1Database,
  bookmarkId: number,
  assetType: AssetType
): Promise<AssetRow | null> {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(bookmarkAssets)
    .where(
      and(
        eq(bookmarkAssets.bookmarkId, bookmarkId),
        eq(bookmarkAssets.assetType, assetType),
        eq(bookmarkAssets.status, 'pending')
      )
    )
    .orderBy(desc(bookmarkAssets.dateCreated))
    .limit(1);
  return rows[0] ?? null;
}

export type AssetWithBookmark = AssetRow & {
  bookmarkOwnerId: number;
  bookmarkShared: boolean;
};

export async function getAssetById(
  d1: D1Database,
  assetId: number
): Promise<AssetWithBookmark | null> {
  const db = getDb(d1);
  const rows = await db
    .select({
      asset: bookmarkAssets,
      bookmarkOwnerId: bookmarks.ownerId,
      bookmarkShared: bookmarks.shared
    })
    .from(bookmarkAssets)
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.bookmarkId))
    .where(eq(bookmarkAssets.id, assetId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { ...r.asset, bookmarkOwnerId: r.bookmarkOwnerId, bookmarkShared: r.bookmarkShared };
}

export async function completeAsset(
  d1: D1Database,
  assetId: number,
  updates: {
    r2Key: string;
    fileSize: number;
    gzip?: boolean;
    status?: AssetStatus;
    contentType?: string;
    displayName?: string;
  }
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(bookmarkAssets)
    .set({
      r2Key: updates.r2Key,
      fileSize: updates.fileSize,
      status: updates.status ?? 'complete',
      gzip: updates.gzip ?? false,
      ...(updates.contentType !== undefined ? { contentType: updates.contentType } : {}),
      ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {})
    })
    .where(eq(bookmarkAssets.id, assetId));
}

export async function failAsset(d1: D1Database, assetId: number): Promise<void> {
  const db = getDb(d1);
  await db.update(bookmarkAssets).set({ status: 'failure' }).where(eq(bookmarkAssets.id, assetId));
}

export async function deleteAsset(
  d1: D1Database,
  ownerId: number,
  assetId: number
): Promise<{ r2Key: string; bookmarkId: number } | null> {
  const db = getDb(d1);
  const rows = await db
    .select({ asset: bookmarkAssets, owner: bookmarks.ownerId })
    .from(bookmarkAssets)
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.bookmarkId))
    .where(and(eq(bookmarkAssets.id, assetId), eq(bookmarks.ownerId, ownerId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  await db.delete(bookmarkAssets).where(eq(bookmarkAssets.id, assetId));
  return { r2Key: r.asset.r2Key, bookmarkId: r.asset.bookmarkId };
}

void normalizeUrl;
