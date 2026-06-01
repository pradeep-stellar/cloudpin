# Cloudflare Reimplementation Plan for Linkding
Prepared: 2026-06-01
## Purpose
This document is a handoff-ready implementation plan for rebuilding the current Django-based Linkding application as a Cloudflare-native TypeScript application. It is based on an inspection of this repository and current Cloudflare platform documentation.

The design goal is not a line-for-line port. The goal is feature parity where it matters to users, with a simpler operational model for one maintainer assisted by AI coding tools.

the new app will be called "cloudpin" - use this name in the new implementation.
## Key Assumptions
- D1 is Cloudflare's serverless SQL database.
  
- Deployment is through Wrangler from GitHub pushes, with explicit Wrangler configuration checked into the repo.
  
- The new application should remain self-hostable in spirit, but the primary supported target is Cloudflare Workers, D1, R2, Queues, Workflows, and Zero Trust Access.
  
- Exact server-side SingleFile CLI behavior cannot be ported directly into a Worker, because Workers cannot shell out to the SingleFile binary or Chromium. Browser-submitted SingleFile uploads can be preserved. Server-side snapshots should be rebuilt using Cloudflare Browser Rendering or moved to a Cloudflare Container if exact SingleFile parity becomes mandatory.
  
## Current Codebase Summary
The current project is a Django 6 application with:

- Server-rendered HTML templates plus Turbo partial updates.
  
- A small JavaScript frontend bundle using Lit components and Hotwire Turbo.
  
- Django ORM models for users, bookmarks, tags, assets, bundles, user profile settings, feed tokens, API tokens, toasts, and global settings.
  
- DRF REST API endpoints for bookmarks, tags, bundles, user profile, and bookmark assets.
  
- Huey background jobs for metadata refresh, favicons, preview images, Internet Archive snapshots, and local HTML/PDF snapshots.
  
- Local filesystem storage under `data/` for favicons, preview images, and assets.
  
- SQLite by default, PostgreSQL optionally.
  
- Session login, OIDC, auth proxy support, bearer/token API auth, feed tokens, PWA manifest, OpenSearch, import/export in Netscape bookmark HTML format, and RSS/Atom feeds.
  

Important source areas:

- Models: `bookmarks/models.py`
  
- Query/search logic: `bookmarks/queries.py`, `bookmarks/services/search_query_parser.py`
  
- REST API: `bookmarks/api/routes.py`, `bookmarks/api/serializers.py`, `bookmarks/api/auth.py`
  
- UI routes: `bookmarks/views/*.py`, `bookmarks/templates/**`
  
- Background jobs: `bookmarks/services/tasks.py`
  
- Assets and snapshots: `bookmarks/services/assets.py`, `bookmarks/services/singlefile.py`
  
- Metadata/favicons/previews: `bookmarks/services/website_loader.py`, `bookmarks/services/favicon_loader.py`, `bookmarks/services/preview_image_loader.py`
  
- Import/export: `bookmarks/services/importer.py`, `bookmarks/services/exporter.py`
  
- Settings/auth options docs: `docs/src/content/docs/options.md`
  
- API docs: `docs/src/content/docs/api.md`
  
## Recommended Cloudflare Stack
Use one full-stack TypeScript application, not separate frontend and backend repos.

- Runtime: Cloudflare Workers
  
- Framework: SvelteKit on Cloudflare Workers, with Hono as the explicit REST/API subrouter
  
- UI: SvelteKit server rendering, load functions, form actions, and progressive-enhanced forms
  
- API/resource routes: Hono mounted under SvelteKit server endpoints for `/api/*`, feeds, and asset streaming
  
- Database: Cloudflare D1
  
- Database access: Drizzle ORM for typed schema and query building, with raw SQL for FTS and complex search
  
- Object storage: Cloudflare R2
  
- Background jobs: Cloudflare Queues with a dead letter queue
  
- Durable multi-step jobs: Cloudflare Workflows for imports and snapshots
  
- Browser capture: Cloudflare Browser Rendering for best-effort server-side snapshots
  
- Authentication: Cloudflare Zero Trust Access for browser identity, plus app-owned API tokens for browser extensions and third-party clients
  
- Validation: Zod
  
- Tests: Vitest, `@cloudflare/vitest-pool-workers`, Miniflare, Playwright
  
- Formatting/linting: Prettier, ESLint, TypeScript strict mode
  
- Observability: Workers Logs with structured JSON logs, source maps, queue DLQs, workflow instance inspection
  

Why SvelteKit + Hono instead of a pure SPA:

- The current app is server-rendered and form-heavy; SvelteKit load functions and form actions map well to that shape.
  
- SvelteKit on Workers supports direct access to Cloudflare bindings while keeping the UI mostly server-driven.
  
- Hono keeps the compatibility REST API compact, explicit, and easy to test.
  
- The domain layer stays framework-independent so the two routing surfaces do not leak into business logic.
  
## Target Architecture
Request flow:

1. Cloudflare routes requests to a Worker.
  
2. Cloudflare Access protects private UI routes.
  
3. The Worker validates Access JWT assertions for browser identity.
  
4. Public shared routes bypass Access at the Cloudflare policy layer and are still authorization-checked by application code.
  
5. API routes accept app-owned bearer tokens and optionally Cloudflare Access service tokens.
  
6. UI and API route handlers use domain services.
  
7. Domain services read/write D1 through repository modules.
  
8. Blob content is stored in private R2 buckets and streamed through the Worker after authorization checks.
  
9. Queue consumers and workflows process background jobs and update D1/R2.
  

Suggested route protection:

- `app.example.com/*`: Cloudflare Access required.
  
- `app.example.com/bookmarks/shared*`: Access bypass policy, application enforces public sharing.
  
- `app.example.com/feeds/shared`: Access bypass policy, application enforces public sharing.
  
- `app.example.com/assets/*`: Access bypass policy only if public shared asset viewing is required; otherwise protected and streamed through app checks.
  
- `app.example.com/api/*`: Access bypass with required app API token, or Access Service Auth plus app API token for stricter deployments.
  

The application must never trust route-level Access rules as the only authorization layer. Each route must enforce ownership/shared/public access using D1 data.
## Repository Layout
Create a new TypeScript application under a separate folder first, so the current Django app remains available as the reference implementation:

```text
cloudflare/
  src/
    app.html
    hooks.server.ts
    routes/
      +layout.server.ts
      +layout.svelte
      +page.server.ts
      +page.svelte
      bookmarks/
        +page.server.ts
        +page.svelte
        archived/+page.server.ts
        archived/+page.svelte
        shared/+page.server.ts
        shared/+page.svelte
        new/+page.server.ts
        new/+page.svelte
        [bookmarkId]/edit/+page.server.ts
        [bookmarkId]/edit/+page.svelte
        [bookmarkId]/details/+server.ts
      tags/
        +page.server.ts
        +page.svelte
        new/+page.server.ts
        [tagId]/edit/+page.server.ts
        merge/+page.server.ts
      bundles/
        +page.server.ts
        +page.svelte
        new/+page.server.ts
        [bundleId]/edit/+page.server.ts
        preview/+server.ts
      settings/
        general/+page.server.ts
        general/+page.svelte
        integrations/+page.server.ts
        integrations/+page.svelte
        import/+server.ts
        export/+server.ts
      api/[...path]/+server.ts
      feeds/[...path]/+server.ts
      assets/[assetId]/+server.ts
      manifest.json/+server.ts
      opensearch.xml/+server.ts
      custom_css/+server.ts
    queue.ts
    workflows/
      import-workflow.ts
      snapshot-workflow.ts
    auth/
      access-jwt.ts
      api-token.ts
      csrf.ts
      session.ts
    db/
      client.ts
      schema.ts
      migrations/
      repositories/
        bookmarks.repo.ts
        tags.repo.ts
        bundles.repo.ts
        assets.repo.ts
        users.repo.ts
        tokens.repo.ts
        settings.repo.ts
    domain/
      bookmarks.ts
      tags.ts
      bundles.ts
      search-parser.ts
      search-sql.ts
      url-normalize.ts
      auto-tagging.ts
      importer.ts
      exporter.ts
      feeds.ts
      markdown.ts
    jobs/
      messages.ts
      handlers/
        metadata.ts
        favicon.ts
        preview.ts
        wayback.ts
        import.ts
        snapshot.ts
    storage/
      r2.ts
      asset-keys.ts
      content-security.ts
    ui/
      components/
      styles/
    validation/
      bookmark.schemas.ts
      tag.schemas.ts
      bundle.schemas.ts
    server/
      hono.ts
      api/
        bookmarks.routes.ts
        tags.routes.ts
        bundles.routes.ts
        assets.routes.ts
        user.routes.ts
        feeds.routes.ts
  test/
    unit/
    integration/
    e2e/
    fixtures/
  tools/
    migrate-linkding.ts
    seed.ts
  public/
    icons/
  wrangler.jsonc
  package.json
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
```

Keep domain modules pure where possible. For example, `search-parser.ts`, `url-normalize.ts`, `auto-tagging.ts`, `importer.ts`, and `exporter.ts` should not import Cloudflare bindings. This makes them easy for AI agents and tests to modify safely.
## D1 Data Model
Use explicit SQL migrations. Use Drizzle schema definitions for type inference, but keep the canonical migration files in SQL under `src/db/migrations` or `migrations`.

Recommended ID strategy:

- Use `INTEGER PRIMARY KEY` for bookmark/tag/bundle/asset IDs to preserve API compatibility and make migration from Django simple.
  
- Use `TEXT` UUID/ULID only for externally exposed long-lived secrets and workflow IDs.
  

Tables:
### users
- `id INTEGER PRIMARY KEY`
  
- `access_subject TEXT UNIQUE`
  
- `email TEXT UNIQUE NOT NULL`
  
- `username TEXT UNIQUE NOT NULL`
  
- `display_name TEXT`
  
- `is_admin INTEGER NOT NULL DEFAULT 0`
  
- `created_at TEXT NOT NULL`
  
- `last_login_at TEXT`
  

Cloudflare Access should be the primary identity source. On first login, upsert a user by `access_subject` or email. Admins are configured through an env var such as `ADMIN_EMAILS`.
### user_profiles
Mirror current `UserProfile` fields:

- `user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
  
- `theme TEXT NOT NULL DEFAULT 'auto'`
  
- `bookmark_date_display TEXT NOT NULL DEFAULT 'relative'`
  
- `bookmark_description_display TEXT NOT NULL DEFAULT 'inline'`
  
- `bookmark_description_max_lines INTEGER NOT NULL DEFAULT 1`
  
- `bookmark_link_target TEXT NOT NULL DEFAULT '_blank'`
  
- `web_archive_integration TEXT NOT NULL DEFAULT 'disabled'`
  
- `tag_search TEXT NOT NULL DEFAULT 'strict'`
  
- `tag_grouping TEXT NOT NULL DEFAULT 'alphabetical'`
  
- `enable_sharing INTEGER NOT NULL DEFAULT 0`
  
- `enable_public_sharing INTEGER NOT NULL DEFAULT 0`
  
- `enable_favicons INTEGER NOT NULL DEFAULT 0`
  
- `enable_preview_images INTEGER NOT NULL DEFAULT 0`
  
- `display_url INTEGER NOT NULL DEFAULT 0`
  
- `display_view_bookmark_action INTEGER NOT NULL DEFAULT 1`
  
- `display_edit_bookmark_action INTEGER NOT NULL DEFAULT 1`
  
- `display_archive_bookmark_action INTEGER NOT NULL DEFAULT 1`
  
- `display_remove_bookmark_action INTEGER NOT NULL DEFAULT 1`
  
- `permanent_notes INTEGER NOT NULL DEFAULT 0`
  
- `custom_css TEXT NOT NULL DEFAULT ''`
  
- `custom_css_hash TEXT NOT NULL DEFAULT ''`
  
- `auto_tagging_rules TEXT NOT NULL DEFAULT ''`
  
- `search_preferences TEXT NOT NULL DEFAULT '{}'`
  
- `enable_automatic_html_snapshots INTEGER NOT NULL DEFAULT 1`
  
- `default_mark_unread INTEGER NOT NULL DEFAULT 0`
  
- `default_mark_shared INTEGER NOT NULL DEFAULT 0`
  
- `items_per_page INTEGER NOT NULL DEFAULT 30`
  
- `sticky_pagination INTEGER NOT NULL DEFAULT 0`
  
- `collapse_side_panel INTEGER NOT NULL DEFAULT 0`
  
- `hide_bundles INTEGER NOT NULL DEFAULT 0`
  
- `legacy_search INTEGER NOT NULL DEFAULT 0`
  

Store JSON fields as TEXT and parse/validate with Zod.
### bookmarks
- `id INTEGER PRIMARY KEY`
  
- `owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  
- `url TEXT NOT NULL`
  
- `url_normalized TEXT NOT NULL`
  
- `title TEXT NOT NULL DEFAULT ''`
  
- `description TEXT NOT NULL DEFAULT ''`
  
- `notes TEXT NOT NULL DEFAULT ''`
  
- `web_archive_snapshot_url TEXT NOT NULL DEFAULT ''`
  
- `favicon_key TEXT NOT NULL DEFAULT ''`
  
- `preview_image_key TEXT NOT NULL DEFAULT ''`
  
- `latest_snapshot_asset_id INTEGER`
  
- `unread INTEGER NOT NULL DEFAULT 0`
  
- `is_archived INTEGER NOT NULL DEFAULT 0`
  
- `shared INTEGER NOT NULL DEFAULT 0`
  
- `date_added TEXT NOT NULL`
  
- `date_modified TEXT NOT NULL`
  
- `date_accessed TEXT`
  

Indexes:

- `CREATE UNIQUE INDEX idx_bookmarks_owner_normalized_url ON bookmarks(owner_id, url_normalized);`
  
- `CREATE INDEX idx_bookmarks_owner_archived_added ON bookmarks(owner_id, is_archived, date_added DESC);`
  
- `CREATE INDEX idx_bookmarks_owner_modified ON bookmarks(owner_id, date_modified DESC);`
  
- `CREATE INDEX idx_bookmarks_shared ON bookmarks(shared, owner_id);`
  
### tags
- `id INTEGER PRIMARY KEY`
  
- `owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  
- `name TEXT NOT NULL`
  
- `name_normalized TEXT NOT NULL`
  
- `date_added TEXT NOT NULL`
  

Indexes:

- `CREATE UNIQUE INDEX idx_tags_owner_name_normalized ON tags(owner_id, name_normalized);`
  
- `CREATE INDEX idx_tags_owner_name ON tags(owner_id, name);`
  
### bookmark_tags
- `bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE`
  
- `tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE`
  
- `PRIMARY KEY(bookmark_id, tag_id)`
  
- `CREATE INDEX idx_bookmark_tags_tag ON bookmark_tags(tag_id);`
  
### bookmark_assets
- `id INTEGER PRIMARY KEY`
  
- `bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE`
  
- `date_created TEXT NOT NULL`
  
- `r2_key TEXT NOT NULL DEFAULT ''`
  
- `file_size INTEGER`
  
- `asset_type TEXT NOT NULL`
  
- `content_type TEXT NOT NULL`
  
- `display_name TEXT NOT NULL DEFAULT ''`
  
- `status TEXT NOT NULL`
  
- `gzip INTEGER NOT NULL DEFAULT 0`
  

Indexes:

- `CREATE INDEX idx_assets_bookmark_created ON bookmark_assets(bookmark_id, date_created DESC);`
  
- `CREATE INDEX idx_assets_status_created ON bookmark_assets(status, date_created);`
  
### bookmark_bundles
Mirror current bundle filters:

- `id INTEGER PRIMARY KEY`
  
- `owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  
- `name TEXT NOT NULL`
  
- `search TEXT NOT NULL DEFAULT ''`
  
- `any_tags TEXT NOT NULL DEFAULT ''`
  
- `all_tags TEXT NOT NULL DEFAULT ''`
  
- `excluded_tags TEXT NOT NULL DEFAULT ''`
  
- `filter_unread TEXT NOT NULL DEFAULT 'off'`
  
- `filter_shared TEXT NOT NULL DEFAULT 'off'`
  
- `sort_order INTEGER NOT NULL DEFAULT 0`
  
- `date_created TEXT NOT NULL`
  
- `date_modified TEXT NOT NULL`
  
### api_tokens
- `id INTEGER PRIMARY KEY`
  
- `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  
- `name TEXT NOT NULL`
  
- `token_prefix TEXT NOT NULL`
  
- `token_hash TEXT NOT NULL UNIQUE`
  
- `created_at TEXT NOT NULL`
  
- `last_used_at TEXT`
  
- `revoked_at TEXT`
  

Only show the raw token once. Store a SHA-256 hash of a high-entropy random token, plus a short prefix for display.
### feed_tokens
- `user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
  
- `token_hash TEXT NOT NULL UNIQUE`
  
- `created_at TEXT NOT NULL`
  

Feed tokens are bearer credentials in URLs. Treat them as secrets. Allow rotation.
### toasts
- `id INTEGER PRIMARY KEY`
  
- `owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  
- `key TEXT NOT NULL`
  
- `message TEXT NOT NULL`
  
- `acknowledged INTEGER NOT NULL DEFAULT 0`
  
### global_settings
- `id INTEGER PRIMARY KEY CHECK (id = 1)`
  
- `landing_page TEXT NOT NULL DEFAULT 'login'`
  
- `guest_profile_user_id INTEGER`
  
- `enable_link_prefetch INTEGER NOT NULL DEFAULT 0`
  
## Search Design
The current search behavior includes:

- term search over title, description, notes, URL
  
- tag search with `#tag`
  
- special keywords `!unread` and `!untagged`
  
- boolean `and`, `or`, `not`
  
- parentheses
  
- quoted phrases
  
- strict/lax tag search modes
  
- legacy search mode
  
- filters for archived/shared/unread/date/bundle/user
  
- sort by added date or resolved title
  

Implementation plan:

1. Port `bookmarks/services/search_query_parser.py` into `src/domain/search-parser.ts`.
  
2. Build a SQL compiler in `src/domain/search-sql.ts`.
  
3. Start with parameterized SQL using `LIKE` for exact behavior.
  
4. Add D1 FTS5 for performance once correctness tests pass.
  
5. Keep test fixtures for all query grammar behavior before optimizing.
  

FTS schema:

```sql
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title,
  description,
  notes,
  url,
  content='bookmarks',
  content_rowid='id'
);
```

Add triggers to keep FTS rows in sync for insert/update/delete. If D1 migration limitations make triggers painful, update FTS rows in the bookmark repository for the first implementation and add triggers later.

Compile tags and special keywords with `EXISTS` subqueries against `bookmark_tags` and `tags`.
## R2 Object Storage
Use a private R2 bucket. Do not expose R2 directly. Stream content through the Worker so the app can enforce access checks.

Suggested bindings:

- `ASSETS_BUCKET`: all favicons, previews, uploaded assets, snapshots, staged imports, and generated exports.
  

Suggested keys:

- `favicons/{domainHash}.{ext}`
  
- `previews/{ownerId}/{bookmarkId}/{imageHash}.{ext}`
  
- `assets/{ownerId}/{bookmarkId}/{assetId}/{safeName}.{ext}`
  
- `snapshots/{ownerId}/{bookmarkId}/{assetId}/snapshot.html.gz`
  
- `snapshots/{ownerId}/{bookmarkId}/{assetId}/snapshot.pdf.gz`
  
- `imports/{ownerId}/{importId}/source.html`
  
- `exports/{ownerId}/{exportId}/bookmarks.html`
  

Asset-serving rules:

- For private assets, require ownership.
  
- For shared assets, allow authenticated users when bookmark owner has sharing enabled.
  
- For public shared assets, allow anonymous access only when bookmark is shared and owner has public sharing enabled.
  
- Set strict CSP based on content type:
  
  - HTML snapshots: `Content-Security-Policy: sandbox allow-scripts`
    
  - PDF: `Content-Security-Policy: default-src 'none'; object-src 'self';`
    
  - Video: `Content-Security-Policy: default-src 'none'; media-src 'self';`
    
- Preserve `Content-Disposition` behavior for inline view and download routes.
  
## Background Jobs
Use one queue first:

- Queue: `linkding-jobs`
  
- Dead letter queue: `linkding-jobs-dlq`
  
- Message schema: discriminated union validated with Zod.
  

Message types:

- `metadata.refresh`
  
- `favicon.load`
  
- `preview.load`
  
- `wayback.create`
  
- `import.process`
  
- `snapshot.create`
  
- `backfill.favicons`
  
- `backfill.previews`
  
- `backfill.snapshots`
  

Each message must be idempotent. Include:

- `jobId`
  
- `type`
  
- `userId`
  
- `bookmarkId` or relevant entity ID
  
- `requestedAt`
  
- `attemptKey`
  

Consumer rules:

- Read current D1 state before writing.
  
- Skip missing/deleted bookmarks.
  
- Avoid duplicate pending snapshot assets for the same bookmark.
  
- Use queue retries for transient network errors.
  
- Move permanently invalid URLs/files to failure state in D1 rather than retrying forever.
  

Use Workflows for multi-step, long-running, or resumable jobs:

- Import workflow: staged R2 file -> parse -> create tags -> batch bookmarks -> attach tags -> enqueue metadata jobs -> write import result.
  
- Snapshot workflow: create asset row -> detect content type -> capture/download -> gzip -> put R2 -> update asset and bookmark.
  
## Authentication and Authorization
### Browser Auth
Use Cloudflare Zero Trust Access for browser authentication.

Worker middleware must validate:

- `Cf-Access-Jwt-Assertion` header
  
- issuer/team domain
  
- audience tag
  
- token signature using Cloudflare Access certs
  
- expected email/subject claims
  

After validation:

- Upsert user by Access subject or email.
  
- Ensure user profile exists.
  
- Mark `is_admin` when email is listed in `ADMIN_EMAILS`.
  
- Create an app session cookie if needed for CSRF and UI preferences.
  

Do not rely only on `Cf-Access-Authenticated-User-Email`. Validate the JWT for private routes.
### CSRF
Because Access cookies are browser credentials, state-changing UI actions need CSRF protection.

Recommended approach:

- Issue an app session cookie after Access validation.
  
- Generate an HMAC CSRF token tied to session ID, user ID, and date bucket.
  
- Include token in forms and fetch headers.
  
- Validate Origin/Host for mutating requests.
  
- Exempt API token routes from browser CSRF but require bearer auth.
  
### API Tokens
Preserve compatibility with current API clients:

```text
Authorization: Token <token>
Authorization: Bearer <token>
```

Route policy options:

- Recommended compatibility mode: Access bypass for `/api/*`, app bearer token required for private API endpoints.
  
- Strict mode: Access Service Auth plus app bearer token.
  

API tokens should:

- Be random 32-byte or stronger URL-safe secrets.
  
- Be shown once.
  
- Be stored hashed.
  
- Have optional last-used tracking.
  
- Support revoke and rotate.
  
### Service Tokens
Support Cloudflare Access service tokens for automation only if the deployment chooses to keep `/api/*` behind Access. Do not replace app API tokens with Access service tokens, because current Linkding third-party clients expect application tokens.
## Feature Parity Matrix
| Current feature | Cloudflare implementation |
| --- | --- |
| Bookmark list, archived list, shared list | SvelteKit pages backed by D1 queries |
| New/edit bookmark | SvelteKit form actions with Zod validation |
| Duplicate URL normalization | Port `normalize_url` and enforce unique `(owner_id, url_normalized)` |
| Tags and tag cloud | D1 tags/bookmark_tags, grouped in UI |
| Tag create/edit/merge | UI actions and repository methods |
| Bundles | D1 `bookmark_bundles`, same filter fields |
| Bulk edit | Form action calling batch repository methods |
| Notes and Markdown | Markdown render/sanitize module |
| Read later/unread | Bookmark boolean |
| Sharing | App-level shared/public route checks |
| Favicons | Queue fetches provider output into R2 |
| Preview images | Queue scrapes metadata and stores allowed images in R2 |
| Website metadata scraping | Worker fetch limited to head/body size, parse HTML metadata |
| Internet Archive snapshot | Queue calls Wayback save API when enabled |
| Local HTML/PDF assets | R2-backed `bookmark_assets` |
| Server-side HTML snapshot | Workflow with Browser Rendering, lower fidelity than SingleFile unless Container added |
| Browser SingleFile upload | Preserve `/api/bookmarks/singlefile/` |
| Import Netscape HTML | Workflow staged in R2, parser ported to TS |
| Export Netscape HTML | SvelteKit server route streams generated HTML |
| REST API | Hono routes matching documented endpoints |
| API pagination | Limit/offset response shape |
| API tokens | D1 hashed token table |
| Feeds | XML server routes by feed token |
| PWA | manifest and static assets through Workers Assets |
| OpenSearch | XML resource route |
| Custom CSS | profile field plus `/custom_css` route |
| Global settings | `global_settings` singleton |
| OIDC/auth proxy | Replaced by Cloudflare Access; optional API token mode remains |
| Admin panel | Build admin-lite pages for users/settings/tokens/jobs, rely on D1 dashboard for raw SQL |
| Health endpoint | `/health` checks Worker, D1, R2 binding availability |
## REST API Contract
Preserve these endpoints from current docs:

- `GET /api/bookmarks/`
  
- `POST /api/bookmarks/`
  
- `GET /api/bookmarks/archived/`
  
- `GET /api/bookmarks/shared/`
  
- `GET /api/bookmarks/check/?url=...`
  
- `GET /api/bookmarks/:id/`
  
- `PUT /api/bookmarks/:id/`
  
- `PATCH /api/bookmarks/:id/`
  
- `DELETE /api/bookmarks/:id/`
  
- `POST /api/bookmarks/:id/archive/`
  
- `POST /api/bookmarks/:id/unarchive/`
  
- `POST /api/bookmarks/singlefile/`
  
- `GET /api/bookmarks/:bookmarkId/assets/`
  
- `POST /api/bookmarks/:bookmarkId/assets/upload/`
  
- `GET /api/bookmarks/:bookmarkId/assets/:assetId/`
  
- `DELETE /api/bookmarks/:bookmarkId/assets/:assetId/`
  
- `GET /api/bookmarks/:bookmarkId/assets/:assetId/download/`
  
- `GET /api/tags/`
  
- `POST /api/tags/`
  
- `GET /api/tags/:id/`
  
- `GET /api/bundles/`
  
- `POST /api/bundles/`
  
- `GET /api/bundles/:id/`
  
- `PUT /api/bundles/:id/`
  
- `PATCH /api/bundles/:id/`
  
- `DELETE /api/bundles/:id/`
  
- `GET /api/user/profile/`
  

Response compatibility:

- Keep DRF-style pagination: `{ count, next, previous, results }`.
  
- Keep bookmark fields: `id`, `url`, `title`, `description`, `notes`, `web_archive_snapshot_url`, `favicon_url`, `preview_image_url`, `is_archived`, `unread`, `shared`, `tag_names`, `date_added`, `date_modified`, `website_title`, `website_description`.
  
- Keep dummy `website_title` and `website_description` fields as null for backward compatibility.
  
- Keep create behavior where duplicate URL updates existing bookmark for now.
  
- Keep edit behavior where duplicate URL errors.
  
## UI Implementation Notes
The UI should preserve the current app's utilitarian bookmark-manager feel, not become a marketing-style SPA.

Pages:

- Root redirect
  
- Active bookmarks
  
- Archived bookmarks
  
- Shared bookmarks
  
- Bookmark create/edit/details
  
- Tags index/new/edit/merge
  
- Bundles index/new/edit/preview
  
- Settings general
  
- Settings integrations/API tokens/feed tokens/bookmarklet
  
- Import/export
  
- Admin-lite page for admins
  

Interaction model:

- Use server actions for forms.
  
- Use fetcher/forms for partial updates where needed.
  
- Avoid heavy global client state.
  
- Keep keyboard shortcuts, tag autocomplete, filter drawer, details modal, upload button, and bulk edit bar.
  
- Build route-level loaders that return exactly the data needed for each page.
  

Styles:

- Port the existing CSS theme tokens first.
  
- Use static Workers Assets for icons and app shell assets.
  
- Do not redesign the UI during the platform migration. Make visual changes only after feature parity.
  
## Snapshot and Archiving Strategy
Current server snapshots depend on SingleFile CLI and subprocesses. Worker runtime cannot do that.

Recommended path:

1. Preserve browser-submitted SingleFile upload through `/api/bookmarks/singlefile/`.
  
2. Preserve uploaded assets and PDF downloads through R2.
  
3. Preserve Internet Archive Wayback integration via queue job.
  
4. Implement server-side snapshots with a Workflow:
  

- Create pending `bookmark_assets` row.
  
- HEAD/GET the URL to detect content type.
  
- If PDF, stream with size limit, gzip, store in R2.
  
- If HTML, use Browser Rendering to load the page, capture serialized HTML or PDF, gzip, store in R2.
  
- Mark asset complete/failure.
  
- Update bookmark `latest_snapshot_asset_id`.
  

5. If exact SingleFile parity becomes required, add a Cloudflare Container running SingleFile and call it from the Workflow. Treat this as a later phase because it adds more operational weight.
  
## Wrangler Configuration Sketch
Use checked-in config, not auto-generated config, so deployments are predictable.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "linkding-cloudflare",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat_v2"],
  "upload_source_maps": true,
  "observability": {
    "enabled": true
  },
  "assets": {
    "directory": "./build/client",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/bookmarks/*", "/settings/*", "/tags/*", "/bundles/*", "/feeds/*", "/assets/*", "/custom_css", "/opensearch.xml", "/manifest.json"]
  },
  "vars": {
    "ACCESS_TEAM_DOMAIN": "example.cloudflareaccess.com",
    "ACCESS_AUD": "replace-me",
    "ADMIN_EMAILS": "owner@example.com",
    "PUBLIC_BASE_URL": "https://app.example.com",
    "FAVICON_PROVIDER": "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={url}&size=32"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "linkding-prod",
      "database_id": "replace-me",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ASSETS_BUCKET",
      "bucket_name": "linkding-assets-prod"
    }
  ],
  "queues": {
    "producers": [
      { "binding": "JOBS", "queue": "linkding-jobs-prod" }
    ],
    "consumers": [
      {
        "queue": "linkding-jobs-prod",
        "max_batch_size": 5,
        "max_batch_timeout": 5,
        "max_retries": 5,
        "dead_letter_queue": "linkding-jobs-dlq-prod"
      }
    ]
  },
  "browser": {
    "binding": "BROWSER"
  },
  "workflows": [
    {
      "name": "linkding-import-prod",
      "binding": "IMPORT_WORKFLOW",
      "class_name": "ImportWorkflow"
    },
    {
      "name": "linkding-snapshot-prod",
      "binding": "SNAPSHOT_WORKFLOW",
      "class_name": "SnapshotWorkflow"
    }
  ]
}
```

Use separate `env.preview` and `env.production` sections with separate D1 databases, R2 buckets, queues, and Access AUD values.

Secrets:

- `APP_SECRET`
  
- `API_TOKEN_PEPPER` if desired
  
- `WAYBACK_ACCESS_KEY` only if needed by chosen Wayback library/API
  
- Any optional third-party error tracking DSN
  
## GitHub Deployment Workflow
Use GitHub Actions for explicit migration and deploy ordering.

Pipeline on pull request:

1. `npm ci`
  
2. `npm run typecheck`
  
3. `npm run lint`
  
4. `npm test`
  
5. `npm run build`
  
6. Optional: deploy preview environment with preview D1/R2 only
  

Pipeline on push to `main`:

1. `npm ci`
  
2. `npm run typecheck`
  
3. `npm run lint`
  
4. `npm test`
  
5. `npm run build`
  
6. `npx wrangler d1 migrations apply linkding-prod --remote`
  
7. `npx wrangler deploy --env production`
  

GitHub secrets:

- `CLOUDFLARE_ACCOUNT_ID`
  
- `CLOUDFLARE_API_TOKEN`
  

Keep migration application explicit. Do not rely on dashboard-only changes.
## Development Workflow
Local commands:

- `npm run dev`: `wrangler dev`
  
- `npm run typecheck`: TypeScript
  
- `npm test`: Vitest unit/integration tests
  
- `npm run test:e2e`: Playwright
  
- `npm run db:migrate:local`: apply D1 migrations locally
  
- `npm run db:migrate:remote:preview`: apply migrations to preview
  
- `npm run db:migrate:remote:prod`: apply migrations to production
  
- `npm run cf:typegen`: `wrangler types`
  

Developer experience requirements:

- TypeScript strict mode.
  
- Generated Cloudflare binding types committed or regenerated in CI check.
  
- Small modules with clear boundaries.
  
- Zod schemas near route/action boundaries.
  
- Repository methods return typed domain records.
  
- No SQL string concatenation. All dynamic values must be parameters.
  
- Golden tests for import/export/search/url normalization.
  
## Migration from Current Linkding
Support two migration paths.
### Path A: Netscape Import
Use existing Linkding export and import into new app.

Pros:

- Simple.
  
- Works for SQLite and Postgres installations.
  
- Preserves bookmarks, titles, descriptions, notes, tags, archived state, unread state, shared state.
  

Cons:

- Does not preserve API tokens, feed tokens, profile settings, asset files, snapshots, favicons, previews, bundle definitions, toast state, or exact IDs.
  
### Path B: Direct Migration Tool
Build `tools/migrate-linkding.ts`.

Inputs:

- `--sqlite /path/to/db.sqlite3` or `--postgres-url`
  
- `--data-dir /path/to/linkding/data`
  
- `--default-user-email owner@example.com`
  
- `--dry-run`
  

Migrates:

- users and profiles
  
- global settings
  
- bookmarks with original IDs when possible
  
- tags and bookmark_tags
  
- bundles
  
- feed token rotation, not raw token preservation unless user explicitly opts in
  
- asset metadata
  
- files from `data/assets`, `data/favicons`, `data/previews` into R2
  

Do not migrate API tokens by default. Generate new tokens after cutover.

Validation:

- Compare counts for users, bookmarks, tags, relationships, bundles, assets.
  
- Spot-check normalized URL uniqueness.
  
- Verify R2 object existence for each asset row.
  
- Run search parity tests on representative queries.
  
## Implementation Phases
### Phase 0: Decisions and Scaffold
Acceptance criteria:

- New `cloudflare/` app scaffolded with SvelteKit + Hono on Workers.
  
- `wrangler.jsonc` checked in with local, preview, and production environments.
  
- D1, R2, Queue, DLQ, and Access config documented.
  
- CI runs typecheck, lint, unit tests, and build.
  
- `wrangler types` integrated.
  
### Phase 1: Core Domain and Schema
Acceptance criteria:

- D1 migrations for users, profiles, bookmarks, tags, bookmark_tags, bundles, assets, tokens, feeds, settings.
  
- Drizzle schema matches SQL.
  
- Ported URL normalization with tests from `bookmarks/tests/test_utils.py`.
  
- Ported tag parsing and auto-tagging with tests.
  
- Ported search parser with tests.
  
### Phase 2: Auth
Acceptance criteria:

- Access JWT validation middleware.
  
- User/profile upsert on login.
  
- Admin email config.
  
- CSRF for UI actions.
  
- API token creation, hashing, auth middleware, revoke flow.
  
- Public shared routes do not create user sessions.
  
### Phase 3: REST API Compatibility
Acceptance criteria:

- Bookmark, tag, bundle, asset, and user profile API endpoints implemented.
  
- DRF-compatible pagination shape.
  
- API token auth supports `Token` and `Bearer`.
  
- Tests cover documented examples and permission boundaries.
  
### Phase 4: Core UI
Acceptance criteria:

- Active, archived, and shared bookmark pages.
  
- New/edit bookmark.
  
- Details modal/page.
  
- Tag cloud with selected tag add/remove behavior.
  
- Sorting, filters, pagination.
  
- Theme and profile display preferences.
  
### Phase 5: Tags, Bundles, Bulk Actions
Acceptance criteria:

- Tags index/search/sort/unused filter.
  
- Tag create/edit/delete/merge.
  
- Bundles create/edit/delete/reorder/preview.
  
- Bulk archive/unarchive/delete/tag/untag/read/unread/share/unshare/refresh/snapshot.
  
### Phase 6: Settings, Feeds, PWA, Import/Export
Acceptance criteria:

- General settings form.
  
- Integrations page with API tokens, feed token rotation, bookmarklet URLs.
  
- Netscape export.
  
- Netscape import workflow.
  
- RSS/Atom feed routes.
  
- PWA manifest and OpenSearch.
  
- Custom CSS route.
  
### Phase 7: R2 Assets and Async Jobs
Acceptance criteria:

- Favicons fetched to R2.
  
- Preview images fetched to R2 with size/type checks.
  
- Asset upload/download/view/delete.
  
- Queue consumer with retries and DLQ.
  
- Backfill jobs for favicons/previews.
  
### Phase 8: Archiving and Snapshots
Acceptance criteria:

- Wayback snapshot job.
  
- Browser SingleFile upload route.
  
- Snapshot Workflow creates pending/complete/failure asset rows.
  
- PDF snapshot path with max size.
  
- Browser Rendering HTML snapshot path documented and tested.
  
### Phase 9: Migration and Cutover
Acceptance criteria:

- Netscape import path documented.
  
- Direct migration tool supports SQLite at minimum.
  
- Dry-run reports counts.
  
- Migration verification command.
  
- Cutover checklist.
  
### Phase 10: Hardening
Acceptance criteria:

- Playwright e2e tests for core workflows.
  
- API contract tests.
  
- Security tests for private/shared/public assets.
  
- Structured logs.
  
- Production deploy runbook.
  
- Backup/restore runbook.
  
## Testing Strategy
Unit tests:

- URL normalization
  
- timestamp parsing
  
- tag parsing/building
  
- auto-tagging rules
  
- search parser and SQL compiler
  
- Netscape parser/exporter
  
- token hashing
  

Integration tests:

- D1 repositories with local D1/Miniflare
  
- API auth and permissions
  
- bookmark CRUD and duplicate behavior
  
- tag merge
  
- bundle filtering
  
- asset R2 operations with local R2
  
- queue handlers idempotency
  

E2E tests:

- login through mocked Access header/JWT in local test mode
  
- create/edit/archive/delete bookmark
  
- search and tag cloud
  
- bulk edit
  
- settings update
  
- API token creation and API call
  
- import/export
  
- asset upload/view/delete
  

Parity tests:

- Port current Python fixture files from `bookmarks/tests/resources`.
  
- Recreate high-value current tests in TypeScript:
  
  - bookmark API permissions
    
  - bookmark API behavior
    
  - queries/search
    
  - importer/exporter
    
  - auto-tagging
    
  - assets service
    
  - feeds
    
  - settings import/export
    
## Operational Runbooks
### Deploy
1. Merge to `main`.
  
2. GitHub Actions runs tests.
  
3. CI applies D1 migrations.
  
4. CI deploys Worker with Wrangler.
  
5. Verify `/health`.
  
6. Check Workers Logs for startup/runtime errors.
  
### Rollback
1. Use Wrangler deployment/version rollback for Worker code.
  
2. If migration is backward-compatible, no D1 action needed.
  
3. If migration is destructive, restore D1 from Time Travel or backup export.
  
4. R2 objects are append-only for assets; avoid destructive cleanup during deploy.
  
### Backup
Minimum:

- D1 Time Travel for short-term point-in-time recovery.
  
- R2 object durability for assets.
  

Recommended:

- Scheduled export workflow dumps D1 to R2 daily.
  
- Store migration version and app version in a `system_state` table.
  
- Keep R2 lifecycle policy for old generated exports/import staging files.
  
### Monitoring
- Enable Workers Logs.
  
- Log JSON with `requestId`, `userId`, `route`, `jobId`, `workflowId`, `durationMs`, `status`.
  
- Alert on queue DLQ count.
  
- Alert on workflow failures.
  
- Track API 401/403/5xx rates.
  
## Security Checklist
- Validate Access JWT signatures and `aud`.
  
- Do not trust user email headers alone.
  
- Hash API and feed tokens.
  
- Show raw API token once.
  
- Protect all mutation routes with CSRF or bearer auth.
  
- Enforce owner/shared/public checks in application code.
  
- Use parameterized SQL only.
  
- Sanitize rendered Markdown.
  
- Use strict CSP for snapshots/assets.
  
- Limit remote fetch sizes for metadata, previews, PDFs, and imports.
  
- Block unsupported content types for previews.
  
- Avoid open redirects for return URLs.
  
- Keep public shared routes read-only.
  
- Use Cloudflare WAF/rate limiting rules for `/api/*`, `/bookmarks/check`, and import/upload routes.
  
## Risks and Open Decisions
1. Server-side HTML snapshot fidelity
  

- Browser Rendering can capture content, but it is not SingleFile CLI.
  
- Decide whether lower fidelity is acceptable.
  
- If not, add Cloudflare Container with SingleFile in a later phase.
  

2. Public sharing with Zero Trust
  

- Access must bypass public shared routes or use a separate public hostname.
  
- Recommended: `app.example.com` private, `share.example.com` public.
  

3. API route protection
  

- Compatibility mode exposes `/api/*` to the internet but requires app tokens.
  
- Strict mode requires Access service tokens and may break existing clients.
  

4. D1 scale
  

- A single D1 database is fine for one-person or small-team use.
  
- If this becomes multi-tenant at large scale, consider one D1 database per tenant or per deployment.
  

5. ORM vs raw SQL
  

- Use Drizzle for normal CRUD.
  
- Use raw SQL for search, FTS, and bulk operations.
  

6. Admin panel scope
  

- Current Django admin gives raw access.
  
- Cloudflare version should implement only needed admin workflows and rely on D1 dashboard/CLI for raw SQL.
  
## Coding Agent Handoff Prompt
Use this prompt to start implementation:

```text
You are implementing the Cloudflare TypeScript reimplementation described in CLOUDFLARE_REIMPLEMENTATION_PLAN.md. Start with Phase 0 and Phase 1 only.

Constraints:
- Keep the existing Django app untouched.
- Create the new app under cloudflare/.
- Use SvelteKit + Hono on Cloudflare Workers, D1, R2, Queues, Workflows, and Wrangler.
- Use TypeScript strict mode, Zod, Drizzle ORM, Vitest, and Playwright.
- Keep domain logic pure and heavily tested.
- Port URL normalization, tag parsing, auto-tagging, and search parser behavior from the current Python code before building UI.
- Add explicit D1 SQL migrations.
- Run typecheck and tests before stopping.

Deliverables for the first pass:
- Scaffolded Cloudflare app.
- Checked-in wrangler config with placeholder bindings.
- D1 migration files for the core schema.
- Drizzle schema.
- Unit tests for URL normalization, tags, auto-tagging, and search parsing.
- Short README section explaining local development commands.
```
## Official Platform References Checked
- Cloudflare D1 overview: [https://developers.cloudflare.com/d1/](https://developers.cloudflare.com/d1/)
  
- D1 Worker API: [https://developers.cloudflare.com/d1/worker-api/d1-database/](https://developers.cloudflare.com/d1/worker-api/d1-database/)
  
- D1 migrations: [https://developers.cloudflare.com/d1/reference/migrations/](https://developers.cloudflare.com/d1/reference/migrations/)
  
- D1 SQL support and FTS5: [https://developers.cloudflare.com/d1/sql-api/sql-statements/](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
  
- Cloudflare R2 Worker API: [https://developers.cloudflare.com/r2/api/workers/workers-api-reference/](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
  
- Workers TypeScript guidance: [https://developers.cloudflare.com/workers/languages/typescript/](https://developers.cloudflare.com/workers/languages/typescript/)
  
- SvelteKit on Workers: [https://developers.cloudflare.com/workers/framework-guides/web-apps/svelte/index.md](https://developers.cloudflare.com/workers/framework-guides/web-apps/svelte/index.md)
  
- Hono on Cloudflare Workers: [https://hono.dev/docs/getting-started/cloudflare-workers](https://hono.dev/docs/getting-started/cloudflare-workers)
  
- Wrangler configuration: [https://developers.cloudflare.com/workers/wrangler/configuration/](https://developers.cloudflare.com/workers/wrangler/configuration/)
  
- GitHub Actions deploys: [https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
  
- Cloudflare Access JWT validation: [https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
  
- Cloudflare Access service tokens: [https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
  
- Cloudflare Queues: [https://developers.cloudflare.com/queues/](https://developers.cloudflare.com/queues/)
  
- Cloudflare Workflows: [https://developers.cloudflare.com/workflows/](https://developers.cloudflare.com/workflows/)
  
- Cloudflare Browser Rendering Wrangler binding: [https://developers.cloudflare.com/browser-rendering/platform/wrangler/](https://developers.cloudflare.com/browser-rendering/platform/wrangler/)
  
- Durable Objects overview: [https://developers.cloudflare.com/durable-objects/](https://developers.cloudflare.com/durable-objects/)
  
- Drizzle Cloudflare D1 docs: [https://orm.drizzle.team/docs/connect-cloudflare-d1](https://orm.drizzle.team/docs/connect-cloudflare-d1)

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
