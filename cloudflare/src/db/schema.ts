import { sql } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
  primaryKey
} from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accessSubject: text('access_subject').unique(),
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  displayName: text('display_name'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(now),
  lastLoginAt: text('last_login_at')
});

export const userProfiles = sqliteTable('user_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('auto'),
  bookmarkDateDisplay: text('bookmark_date_display').notNull().default('relative'),
  bookmarkDescriptionDisplay: text('bookmark_description_display').notNull().default('inline'),
  bookmarkDescriptionMaxLines: integer('bookmark_description_max_lines').notNull().default(1),
  bookmarkLinkTarget: text('bookmark_link_target').notNull().default('_blank'),
  webArchiveIntegration: text('web_archive_integration').notNull().default('disabled'),
  tagSearch: text('tag_search').notNull().default('strict'),
  tagGrouping: text('tag_grouping').notNull().default('alphabetical'),
  enableSharing: integer('enable_sharing', { mode: 'boolean' }).notNull().default(false),
  enablePublicSharing: integer('enable_public_sharing', { mode: 'boolean' })
    .notNull()
    .default(false),
  enableFavicons: integer('enable_favicons', { mode: 'boolean' }).notNull().default(false),
  enablePreviewImages: integer('enable_preview_images', { mode: 'boolean' })
    .notNull()
    .default(false),
  displayUrl: integer('display_url', { mode: 'boolean' }).notNull().default(false),
  displayViewBookmarkAction: integer('display_view_bookmark_action', { mode: 'boolean' })
    .notNull()
    .default(true),
  displayEditBookmarkAction: integer('display_edit_bookmark_action', { mode: 'boolean' })
    .notNull()
    .default(true),
  displayArchiveBookmarkAction: integer('display_archive_bookmark_action', { mode: 'boolean' })
    .notNull()
    .default(true),
  displayRemoveBookmarkAction: integer('display_remove_bookmark_action', { mode: 'boolean' })
    .notNull()
    .default(true),
  permanentNotes: integer('permanent_notes', { mode: 'boolean' }).notNull().default(false),
  customCss: text('custom_css').notNull().default(''),
  customCssHash: text('custom_css_hash').notNull().default(''),
  autoTaggingRules: text('auto_tagging_rules').notNull().default(''),
  searchPreferences: text('search_preferences').notNull().default('{}'),
  enableAutomaticHtmlSnapshots: integer('enable_automatic_html_snapshots', { mode: 'boolean' })
    .notNull()
    .default(true),
  defaultMarkUnread: integer('default_mark_unread', { mode: 'boolean' }).notNull().default(false),
  defaultMarkShared: integer('default_mark_shared', { mode: 'boolean' }).notNull().default(false),
  itemsPerPage: integer('items_per_page').notNull().default(30),
  stickyPagination: integer('sticky_pagination', { mode: 'boolean' }).notNull().default(false),
  collapseSidePanel: integer('collapse_side_panel', { mode: 'boolean' }).notNull().default(false),
  hideBundles: integer('hide_bundles', { mode: 'boolean' }).notNull().default(false),
  legacySearch: integer('legacy_search', { mode: 'boolean' }).notNull().default(false)
});

/** FTS5 external-content index; rows are synced via SQL triggers (migration 0003). */
export const bookmarksFts = sqliteTable('bookmarks_fts', {
  title: text('title'),
  description: text('description'),
  notes: text('notes'),
  url: text('url')
});

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlNormalized: text('url_normalized').notNull(),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    webArchiveSnapshotUrl: text('web_archive_snapshot_url').notNull().default(''),
    faviconKey: text('favicon_key').notNull().default(''),
    previewImageKey: text('preview_image_key').notNull().default(''),
    latestSnapshotAssetId: integer('latest_snapshot_asset_id'),
    unread: integer('unread', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
    dateAdded: text('date_added').notNull().default(now),
    dateModified: text('date_modified').notNull().default(now),
    dateAccessed: text('date_accessed')
  },
  (table) => [
    uniqueIndex('idx_bookmarks_owner_normalized_url').on(table.ownerId, table.urlNormalized),
    index('idx_bookmarks_owner_archived_added').on(
      table.ownerId,
      table.isArchived,
      table.dateAdded
    ),
    index('idx_bookmarks_owner_modified').on(table.ownerId, table.dateModified),
    index('idx_bookmarks_shared').on(table.shared, table.ownerId)
  ]
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    dateAdded: text('date_added').notNull().default(now)
  },
  (table) => [
    uniqueIndex('idx_tags_owner_name_normalized').on(table.ownerId, table.nameNormalized),
    index('idx_tags_owner_name').on(table.ownerId, table.name)
  ]
);

export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    index('idx_bookmark_tags_tag').on(table.tagId)
  ]
);

export const bookmarkAssets = sqliteTable(
  'bookmark_assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    dateCreated: text('date_created').notNull().default(now),
    r2Key: text('r2_key').notNull().default(''),
    fileSize: integer('file_size'),
    assetType: text('asset_type').notNull(),
    contentType: text('content_type').notNull(),
    displayName: text('display_name').notNull().default(''),
    status: text('status').notNull(),
    gzip: integer('gzip', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [
    index('idx_assets_bookmark_created').on(table.bookmarkId, table.dateCreated),
    index('idx_assets_status_created').on(table.status, table.dateCreated),
    uniqueIndex('idx_assets_pending_bookmark_type')
      .on(table.bookmarkId, table.assetType)
      .where(sql`${table.status} = 'pending'`)
  ]
);

export const bookmarkBundles = sqliteTable(
  'bookmark_bundles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    search: text('search').notNull().default(''),
    anyTags: text('any_tags').notNull().default(''),
    allTags: text('all_tags').notNull().default(''),
    excludedTags: text('excluded_tags').notNull().default(''),
    filterUnread: text('filter_unread').notNull().default('off'),
    filterShared: text('filter_shared').notNull().default('off'),
    sortOrder: integer('sort_order').notNull().default(0),
    dateCreated: text('date_created').notNull().default(now),
    dateModified: text('date_modified').notNull().default(now)
  },
  (table) => [index('idx_bundles_owner_order').on(table.ownerId, table.sortOrder)]
);

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: text('created_at').notNull().default(now),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at')
  },
  (table) => [index('idx_api_tokens_user').on(table.userId)]
);

export const feedTokens = sqliteTable('feed_tokens', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: text('created_at').notNull().default(now)
});

export const toasts = sqliteTable(
  'toasts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    message: text('message').notNull(),
    acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [index('idx_toasts_owner').on(table.ownerId, table.acknowledged)]
);

export const globalSettings = sqliteTable('global_settings', {
  id: integer('id').primaryKey().$type<1>(),
  landingPage: text('landing_page').notNull().default('login'),
  guestProfileUserId: integer('guest_profile_user_id'),
  enableLinkPrefetch: integer('enable_link_prefetch', { mode: 'boolean' }).notNull().default(false)
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type BookmarkAsset = typeof bookmarkAssets.$inferSelect;
export type NewBookmarkAsset = typeof bookmarkAssets.$inferInsert;
export type BookmarkBundle = typeof bookmarkBundles.$inferSelect;
export type NewBookmarkBundle = typeof bookmarkBundles.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type FeedToken = typeof feedTokens.$inferSelect;
export type NewFeedToken = typeof feedTokens.$inferInsert;
export type Toast = typeof toasts.$inferSelect;
export type NewToast = typeof toasts.$inferInsert;
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type NewGlobalSettings = typeof globalSettings.$inferInsert;
