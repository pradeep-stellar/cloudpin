import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findPendingAsset,
  type AssetStatus,
  type AssetType
} from '../../src/db/repositories/assets.repo';
import { runJob, type QueueEnv } from '../../src/jobs/runner';
import type { JobMessage } from '../../src/jobs/messages';

type Row = Record<string, unknown>;

type AssetRow = {
  id: number;
  bookmarkId: number;
  dateCreated: string;
  r2Key: string;
  fileSize: number | null;
  assetType: AssetType;
  contentType: string;
  displayName: string;
  status: AssetStatus;
  gzip: 0 | 1;
};

type BookmarkRow = {
  id: number;
  ownerId: number;
  url: string;
  urlNormalized: string;
  title: string;
  description: string;
  notes: string;
  webArchiveSnapshotUrl: string;
  faviconKey: string;
  previewImageKey: string;
  latestSnapshotAssetId: number | null;
  unread: 0 | 1;
  isArchived: 0 | 1;
  shared: 0 | 1;
  dateAdded: string;
  dateModified: string;
  dateAccessed: string | null;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('job runner asset idempotency', () => {
  it('findPendingAsset returns the newest pending row for a bookmark and asset type', async () => {
    const d1 = new StatefulD1({
      assets: [
        makeAssetRow({ id: 1, assetType: 'favicon', status: 'complete' }),
        makeAssetRow({
          id: 2,
          assetType: 'favicon',
          status: 'pending',
          dateCreated: '2026-01-01T00:00:00.000Z'
        }),
        makeAssetRow({
          id: 3,
          assetType: 'favicon',
          status: 'pending',
          dateCreated: '2026-01-02T00:00:00.000Z'
        }),
        makeAssetRow({ id: 4, assetType: 'preview', status: 'pending' })
      ]
    });

    const pending = await findPendingAsset(d1.asD1(), 42, 'favicon');

    expect(pending?.id).toBe(3);
  });

  it.each([
    { jobType: 'favicon.load', assetType: 'favicon' },
    { jobType: 'preview.load', assetType: 'preview' },
    { jobType: 'snapshot.create', assetType: 'snapshot' }
  ] as const)(
    '$jobType no-ops when a pending $assetType asset already exists',
    async ({ jobType, assetType }) => {
      const d1 = new StatefulD1({ assets: [makeAssetRow({ assetType, status: 'pending' })] });
      const bucket = new MockR2Bucket();
      const fetchMock = installSuccessfulFetch();

      const result = await runJob({
        env: makeEnv(d1, bucket),
        message: makeMessage(jobType)
      });

      expect(result).toEqual({ ok: true, reason: 'pending_asset_exists' });
      expect(d1.insertCount).toBe(0);
      expect(d1.pendingCount(assetType)).toBe(1);
      expect(bucket.putCount).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    { jobType: 'favicon.load', assetType: 'favicon' },
    { jobType: 'preview.load', assetType: 'preview' },
    { jobType: 'snapshot.create', assetType: 'snapshot' }
  ] as const)(
    '$jobType inserts on first run and inserts again after the prior row completes',
    async ({ jobType, assetType }) => {
      const d1 = new StatefulD1();
      const bucket = new MockR2Bucket();
      installSuccessfulFetch();
      const env = makeEnv(d1, bucket);

      const first = await runJob({
        env,
        message: makeMessage(jobType)
      });
      const second = await runJob({
        env,
        message: makeMessage(jobType, { jobId: 'j2', attemptKey: 'a2' })
      });

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });
      expect(d1.insertCount).toBe(2);
      expect(d1.pendingCount(assetType)).toBe(0);
      expect(
        d1.assets.filter((asset) => asset.assetType === assetType && asset.status === 'complete')
      ).toHaveLength(2);
      expect(bucket.putCount).toBe(2);
    }
  );

  it.each(['complete', 'failure'] as const)(
    'creates a fresh favicon asset when the existing row is %s',
    async (status) => {
      const d1 = new StatefulD1({ assets: [makeAssetRow({ status })] });
      const bucket = new MockR2Bucket();
      installSuccessfulFetch();

      const result = await runJob({
        env: makeEnv(d1, bucket),
        message: makeMessage('favicon.load')
      });

      expect(result).toEqual({ ok: true });
      expect(d1.insertCount).toBe(1);
      expect(d1.pendingCount('favicon')).toBe(0);
      expect(d1.assets.filter((asset) => asset.assetType === 'favicon')).toHaveLength(2);
      expect(bucket.putCount).toBe(1);
    }
  );

  it('marks deterministic favicon fetch failures as failed so a later retry can insert again', async () => {
    const d1 = new StatefulD1();
    const bucket = new MockR2Bucket();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await runJob({
      env: makeEnv(d1, bucket),
      message: makeMessage('favicon.load')
    });
    const second = await runJob({
      env: makeEnv(d1, bucket),
      message: makeMessage('favicon.load', { jobId: 'j2', attemptKey: 'a2' })
    });

    expect(first).toEqual({ ok: false, reason: 'favicon_fetch_failed' });
    expect(second).toEqual({ ok: true });
    expect(d1.insertCount).toBe(2);
    expect(d1.assets[0]?.status).toBe('failure');
    expect(d1.assets[1]?.status).toBe('complete');
    expect(d1.pendingCount('favicon')).toBe(0);
  });

  it.each([
    { jobType: 'favicon.load', assetType: 'favicon' },
    { jobType: 'preview.load', assetType: 'preview' },
    { jobType: 'snapshot.create', assetType: 'snapshot' }
  ] as const)(
    '$jobType keeps one pending row after storage fails and three queue retries run',
    async ({ jobType, assetType }) => {
      const d1 = new StatefulD1();
      const bucket = new MockR2Bucket({ failFirstPut: true });
      const fetchMock = installSuccessfulFetch();
      const env = makeEnv(d1, bucket);
      const message = makeMessage(jobType);

      await expect(runJob({ env, message })).rejects.toThrow('put failed');
      expect(d1.insertCount).toBe(1);
      expect(d1.pendingCount(assetType)).toBe(1);

      for (let i = 0; i < 3; i += 1) {
        const retry = await runJob({
          env,
          message: makeMessage(jobType, { jobId: `retry-${i}`, attemptKey: `retry-${i}` })
        });
        expect(retry).toEqual({ ok: true, reason: 'pending_asset_exists' });
      }

      expect(d1.insertCount).toBe(1);
      expect(d1.pendingCount(assetType)).toBe(1);
      expect(bucket.putCount).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(jobType === 'preview.load' ? 2 : 1);
    }
  );
});

class StatefulD1 {
  readonly assets: AssetRow[];
  private bookmark: BookmarkRow | null;
  private nextAssetId: number;
  insertCount = 0;

  constructor(opts: { bookmark?: BookmarkRow | null; assets?: AssetRow[] } = {}) {
    this.bookmark = opts.bookmark === undefined ? makeBookmarkRow() : opts.bookmark;
    this.assets = opts.assets ? [...opts.assets] : [];
    this.nextAssetId = Math.max(100, ...this.assets.map((asset) => asset.id + 1));
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  pendingCount(assetType: AssetType): number {
    return this.assets.filter(
      (asset) => asset.assetType === assetType && asset.status === 'pending'
    ).length;
  }

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        first: async () => this.execute(sql, args)[0] ?? null,
        all: async () => ({ results: this.execute(sql, args) }),
        raw: async () => this.execute(sql, args).map((row) => Object.values(row)),
        run: async () => {
          const rows = this.execute(sql, args);
          return {
            success: true,
            meta: { changes: rows.length, last_row_id: rows[0]?.id ?? null, duration: 0 }
          };
        }
      })
    };
  }

  private execute(sql: string, args: unknown[]): Row[] {
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

    if (normalized.includes('from "bookmark_tags"')) {
      return [];
    }
    if (normalized.includes('from "bookmark_assets"')) {
      return this.selectAssets(args);
    }
    if (normalized.includes('insert into "bookmark_assets"')) {
      return this.insertAsset(args);
    }
    if (normalized.includes('update "bookmark_assets"')) {
      this.updateAsset(args);
      return [];
    }
    if (normalized.includes('from "bookmarks"')) {
      return this.selectBookmarks(args);
    }
    if (normalized.includes('update "bookmarks"')) {
      return [];
    }

    throw new Error(`StatefulD1: no handler for SQL: ${sql}`);
  }

  private selectBookmarks(args: unknown[]): Row[] {
    if (!this.bookmark) return [];
    const hasBookmarkId = args.includes(this.bookmark.id);
    const checksOwner = args.includes(this.bookmark.ownerId);
    if (!hasBookmarkId) return [];
    if (checksOwner && !args.includes(this.bookmark.ownerId)) return [];
    return [this.bookmark as unknown as Row];
  }

  private selectAssets(args: unknown[]): Row[] {
    const bookmarkId = Number(args[0]);
    const assetType = String(args[1]) as AssetType;
    const status = String(args[2]) as AssetStatus;
    const limit = Number(args.at(-1) ?? 1);
    return this.assets
      .filter(
        (asset) =>
          asset.bookmarkId === bookmarkId &&
          asset.assetType === assetType &&
          asset.status === status
      )
      .sort((a, b) => b.dateCreated.localeCompare(a.dateCreated))
      .slice(0, limit) as unknown as Row[];
  }

  private insertAsset(args: unknown[]): Row[] {
    const bookmarkId = firstNumber(args) ?? this.bookmark?.id ?? 42;
    const assetType = args.find(isAssetType) ?? 'upload';
    const status = args.find(isAssetStatus) ?? 'pending';
    if (
      status === 'pending' &&
      this.assets.some(
        (asset) =>
          asset.bookmarkId === bookmarkId &&
          asset.assetType === assetType &&
          asset.status === 'pending'
      )
    ) {
      throw new Error('unique pending asset violation');
    }

    const id = this.nextAssetId;
    this.nextAssetId += 1;
    this.insertCount += 1;
    this.assets.push(
      makeAssetRow({
        id,
        bookmarkId,
        assetType,
        status,
        contentType: findContentType(args) ?? 'application/octet-stream',
        displayName: findDisplayName(args, assetType),
        gzip: assetType === 'snapshot' ? 1 : 0
      })
    );
    return [{ id }];
  }

  private updateAsset(args: unknown[]): void {
    const assetId = Number(args.at(-1));
    const asset = this.assets.find((row) => row.id === assetId);
    if (!asset) return;
    const status = args.find(isAssetStatus);
    if (status) asset.status = status;
    const fileSize = args.find((arg) => typeof arg === 'number' && arg !== assetId);
    if (typeof fileSize === 'number') asset.fileSize = fileSize;
    const contentType = findContentType(args);
    if (contentType) asset.contentType = contentType;
    if (args.includes(1) || args.includes(true)) asset.gzip = 1;
  }
}

class MockR2Bucket {
  private readonly failFirstPut: boolean;
  putCount = 0;

  constructor(opts: { failFirstPut?: boolean } = {}) {
    this.failFirstPut = opts.failFirstPut ?? false;
  }

  async put() {
    this.putCount += 1;
    if (this.failFirstPut && this.putCount === 1) {
      throw new Error('put failed');
    }
    return { key: 'stored-key', size: 1, etag: 'etag', uploaded: new Date(), httpMetadata: {} };
  }

  async get() {
    return null;
  }

  async head() {
    return null;
  }

  async delete() {
    return undefined;
  }

  asR2(): R2Bucket {
    return this as unknown as R2Bucket;
  }
}

function makeEnv(d1: StatefulD1, bucket: MockR2Bucket): QueueEnv {
  return {
    DB: d1.asD1(),
    ASSETS_BUCKET: bucket.asR2(),
    FAVICON_PROVIDER: 'https://assets.example.test/favicon.png'
  };
}

function makeMessage(type: JobMessage['type'], overrides: Partial<JobMessage> = {}): JobMessage {
  return {
    jobId: 'j1',
    type,
    userId: 1,
    bookmarkId: 42,
    attemptKey: 'a1',
    requestedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as JobMessage;
}

function makeBookmarkRow(overrides: Partial<BookmarkRow> = {}): BookmarkRow {
  return {
    id: 42,
    ownerId: 1,
    url: 'https://example.com/page',
    urlNormalized: 'https://example.com/page',
    title: 'Example',
    description: '',
    notes: '',
    webArchiveSnapshotUrl: '',
    faviconKey: '',
    previewImageKey: '',
    latestSnapshotAssetId: null,
    unread: 0,
    isArchived: 0,
    shared: 0,
    dateAdded: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-01-01T00:00:00.000Z',
    dateAccessed: null,
    ...overrides
  };
}

function makeAssetRow(overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    id: 10,
    bookmarkId: 42,
    dateCreated: '2026-01-01T00:00:00.000Z',
    r2Key: '',
    fileSize: null,
    assetType: 'favicon',
    contentType: 'image/png',
    displayName: 'asset',
    status: 'pending',
    gzip: 0,
    ...overrides
  };
}

function installSuccessfulFetch() {
  const image = new Uint8Array([1, 2, 3]);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/favicon.png') || url.endsWith('/preview.png')) {
      return new Response(image, {
        status: 200,
        headers: { 'content-type': 'image/png' }
      });
    }
    return new Response(
      '<html><head><meta property="og:image" content="https://cdn.example.test/preview.png"></head></html>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    );
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function firstNumber(args: unknown[]): number | null {
  const value = args.find((arg) => typeof arg === 'number');
  return typeof value === 'number' ? value : null;
}

function findContentType(args: unknown[]): string | null {
  const value = args.find((arg) => typeof arg === 'string' && arg.includes('/'));
  return typeof value === 'string' ? value : null;
}

function findDisplayName(args: unknown[], assetType: AssetType): string {
  const value = args.find(
    (arg) =>
      typeof arg === 'string' &&
      arg !== assetType &&
      !arg.includes('/') &&
      !isAssetStatus(arg) &&
      arg.length > 0
  );
  return typeof value === 'string' ? value : assetType;
}

function isAssetType(value: unknown): value is AssetType {
  return value === 'upload' || value === 'snapshot' || value === 'favicon' || value === 'preview';
}

function isAssetStatus(value: unknown): value is AssetStatus {
  return value === 'pending' || value === 'complete' || value === 'failure';
}
