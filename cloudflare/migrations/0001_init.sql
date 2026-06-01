CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  access_subject TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

--> statement-breakpoint

CREATE TABLE user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'auto',
  bookmark_date_display TEXT NOT NULL DEFAULT 'relative',
  bookmark_description_display TEXT NOT NULL DEFAULT 'inline',
  bookmark_description_max_lines INTEGER NOT NULL DEFAULT 1,
  bookmark_link_target TEXT NOT NULL DEFAULT '_blank',
  web_archive_integration TEXT NOT NULL DEFAULT 'disabled',
  tag_search TEXT NOT NULL DEFAULT 'strict',
  tag_grouping TEXT NOT NULL DEFAULT 'alphabetical',
  enable_sharing INTEGER NOT NULL DEFAULT 0,
  enable_public_sharing INTEGER NOT NULL DEFAULT 0,
  enable_favicons INTEGER NOT NULL DEFAULT 0,
  enable_preview_images INTEGER NOT NULL DEFAULT 0,
  display_url INTEGER NOT NULL DEFAULT 0,
  display_view_bookmark_action INTEGER NOT NULL DEFAULT 1,
  display_edit_bookmark_action INTEGER NOT NULL DEFAULT 1,
  display_archive_bookmark_action INTEGER NOT NULL DEFAULT 1,
  display_remove_bookmark_action INTEGER NOT NULL DEFAULT 1,
  permanent_notes INTEGER NOT NULL DEFAULT 0,
  custom_css TEXT NOT NULL DEFAULT '',
  custom_css_hash TEXT NOT NULL DEFAULT '',
  auto_tagging_rules TEXT NOT NULL DEFAULT '',
  search_preferences TEXT NOT NULL DEFAULT '{}',
  enable_automatic_html_snapshots INTEGER NOT NULL DEFAULT 1,
  default_mark_unread INTEGER NOT NULL DEFAULT 0,
  default_mark_shared INTEGER NOT NULL DEFAULT 0,
  items_per_page INTEGER NOT NULL DEFAULT 30,
  sticky_pagination INTEGER NOT NULL DEFAULT 0,
  collapse_side_panel INTEGER NOT NULL DEFAULT 0,
  hide_bundles INTEGER NOT NULL DEFAULT 0,
  legacy_search INTEGER NOT NULL DEFAULT 0
);

--> statement-breakpoint

CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_normalized TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  web_archive_snapshot_url TEXT NOT NULL DEFAULT '',
  favicon_key TEXT NOT NULL DEFAULT '',
  preview_image_key TEXT NOT NULL DEFAULT '',
  latest_snapshot_asset_id INTEGER,
  unread INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  shared INTEGER NOT NULL DEFAULT 0,
  date_added TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  date_accessed TEXT
);

--> statement-breakpoint

CREATE UNIQUE INDEX idx_bookmarks_owner_normalized_url ON bookmarks(owner_id, url_normalized);

--> statement-breakpoint

CREATE INDEX idx_bookmarks_owner_archived_added ON bookmarks(owner_id, is_archived, date_added DESC);

--> statement-breakpoint

CREATE INDEX idx_bookmarks_owner_modified ON bookmarks(owner_id, date_modified DESC);

--> statement-breakpoint

CREATE INDEX idx_bookmarks_shared ON bookmarks(shared, owner_id);

--> statement-breakpoint

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  date_added TEXT NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX idx_tags_owner_name_normalized ON tags(owner_id, name_normalized);

--> statement-breakpoint

CREATE INDEX idx_tags_owner_name ON tags(owner_id, name);

--> statement-breakpoint

CREATE TABLE bookmark_tags (
  bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (bookmark_id, tag_id)
);

--> statement-breakpoint

CREATE INDEX idx_bookmark_tags_tag ON bookmark_tags(tag_id);

--> statement-breakpoint

CREATE TABLE bookmark_assets (
  id INTEGER PRIMARY KEY,
  bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  date_created TEXT NOT NULL,
  r2_key TEXT NOT NULL DEFAULT '',
  file_size INTEGER,
  asset_type TEXT NOT NULL,
  content_type TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  gzip INTEGER NOT NULL DEFAULT 0
);

--> statement-breakpoint

CREATE INDEX idx_assets_bookmark_created ON bookmark_assets(bookmark_id, date_created DESC);

--> statement-breakpoint

CREATE INDEX idx_assets_status_created ON bookmark_assets(status, date_created);

--> statement-breakpoint

CREATE TABLE bookmark_bundles (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  search TEXT NOT NULL DEFAULT '',
  any_tags TEXT NOT NULL DEFAULT '',
  all_tags TEXT NOT NULL DEFAULT '',
  excluded_tags TEXT NOT NULL DEFAULT '',
  filter_unread TEXT NOT NULL DEFAULT 'off',
  filter_shared TEXT NOT NULL DEFAULT 'off',
  sort_order INTEGER NOT NULL DEFAULT 0,
  date_created TEXT NOT NULL,
  date_modified TEXT NOT NULL
);

--> statement-breakpoint

CREATE INDEX idx_bundles_owner_order ON bookmark_bundles(owner_id, sort_order);

--> statement-breakpoint

CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

--> statement-breakpoint

CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

--> statement-breakpoint

CREATE TABLE feed_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

--> statement-breakpoint

CREATE TABLE toasts (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

--> statement-breakpoint

CREATE INDEX idx_toasts_owner ON toasts(owner_id, acknowledged);

--> statement-breakpoint

CREATE TABLE global_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  landing_page TEXT NOT NULL DEFAULT 'login',
  guest_profile_user_id INTEGER,
  enable_link_prefetch INTEGER NOT NULL DEFAULT 0
);
