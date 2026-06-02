# cloudpin REST API

This document describes the REST API exposed by the cloudpin Worker at
`/api/*`. The API is intentionally compatible with the legacy Linkding
DRF surface so existing third-party clients keep working.

## Authentication

All `/api/*` requests require an app-owned bearer token:

```text
Authorization: Token <token>
Authorization: Bearer <token>
```

The token can be created from **Settings → Integrations → API tokens**
in the web UI, or via `POST /api/auth/api-tokens/` (see below). Tokens
are shown once at creation, stored as a SHA-256 hash in D1, and can be
revoked at any time. The auth middleware accepts both `Token` and
`Bearer` prefixes case-insensitively.

## Pagination

List endpoints return a DRF-style envelope:

```json
{
  "count": 123,
  "next": "/api/bookmarks/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

Query parameters:

- `page` (1-indexed) — required to enable paging
- `page_size` — overrides the user profile `items_per_page` (default 30, max 200)
- `q` — search query (see [Search semantics](#search-semantics))

## Endpoints

### Bookmarks

- `GET /api/bookmarks/` — list active bookmarks for the authenticated
  user. Returns the DRF envelope.
- `POST /api/bookmarks/` — create or **upsert** a bookmark (see
  [Upsert semantics](#upsert-semantics)). Returns 201 on a new
  bookmark, 200 on a merged upsert.
- `GET /api/bookmarks/archived/` — list archived bookmarks.
- `GET /api/bookmarks/shared/` — list shared bookmarks.
- `GET /api/bookmarks/check/?url=...` — check if a bookmark with the
  given URL exists for the authenticated user. Returns `{exists, id, ...}`
  or `{exists: false}`.
- `GET /api/bookmarks/:id/` — fetch one bookmark.
- `PUT /api/bookmarks/:id/` — full update. URL field is required.
- `PATCH /api/bookmarks/:id/` — partial update.
- `DELETE /api/bookmarks/:id/` — delete.
- `POST /api/bookmarks/:id/archive/` — archive.
- `POST /api/bookmarks/:id/unarchive/` — unarchive.
- `POST /api/bookmarks/singlefile/` — upload a SingleFile snapshot
  bundle. Accepts multipart form data with a `payload` field.
- `GET /api/bookmarks/:bookmarkId/assets/` — list assets.
- `POST /api/bookmarks/:bookmarkId/assets/upload/` — upload an asset
  (multipart form data).
- `GET /api/bookmarks/:bookmarkId/assets/:assetId/` — view an asset
  inline.
- `GET /api/bookmarks/:bookmarkId/assets/:assetId/download/` —
  download an asset.
- `DELETE /api/bookmarks/:bookmarkId/assets/:assetId/` — delete an
  asset.

### Tags

- `GET /api/tags/` — list tags for the authenticated user.
- `POST /api/tags/` — create a tag. Returns 201.
- `GET /api/tags/:id/` — fetch one tag.

### Bundles

- `GET /api/bundles/` — list bundles.
- `POST /api/bundles/` — create a bundle.
- `GET /api/bundles/:id/` — fetch one bundle.
- `PUT /api/bundles/:id/` — full update.
- `PATCH /api/bundles/:id/` — partial update.
- `DELETE /api/bundles/:id/` — delete.

### Profile

- `GET /api/user/profile/` — fetch the authenticated user's profile,
  including display preferences.

### API tokens (admin)

- `POST /api/auth/api-tokens/` — create an API token. Body: `{"name":
"..."}`. Response includes the raw token **once** in the `token`
  field; subsequent reads do not include it.
- `GET /api/auth/api-tokens/` — list tokens for the authenticated user.
- `POST /api/auth/api-tokens/:id/revoke/` — revoke a token.

## Upsert semantics

`POST /api/bookmarks/` is idempotent on `(owner_id,
url_normalized)` and supports **upsert** mode for compatibility with
the legacy Linkding API. The decision is made by inspecting the raw
request body, not the Zod-parsed data, so an explicit empty string
(`title: ""`) is treated as a real overwrite signal.

- **Idempotent insert**: when the request body contains only `url`
  (no other keys), and a bookmark with that normalized URL already
  exists, the existing record is returned unchanged with status `200`.
- **Upsert**: when the request body contains `url` plus any other
  field — `title`, `description`, `notes`, `is_archived`, `unread`,
  `shared`, or `tag_names` (including an empty array, which signals
  "clear my tags") — and a bookmark with that normalized URL already
  exists, the supplied fields are merged into the existing record and
  the merged record is returned with status `200`.
- **Create**: when no bookmark with the normalized URL exists, a new
  one is created and returned with status `201`.

Fields that are not present in the request body are left untouched on
the existing record. The URL itself is the only required field and is
the deduplication key.

Example: create, then update the title without changing tags.

```bash
# 1. First POST creates the bookmark.
curl -fsS -X POST http://localhost:8787/api/bookmarks/ \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","title":"Example"}'
# 201 Created
# { "id": 42, "url": "...", "title": "Example", "tag_names": [], ... }

# 2. Second POST with the same URL but a new title upserts.
curl -fsS -X POST http://localhost:8787/api/bookmarks/ \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","title":"Example (updated)"}'
# 200 OK
# { "id": 42, "url": "...", "title": "Example (updated)", "tag_names": [], ... }
```

## Search semantics

The `q` parameter on `GET /api/bookmarks/` and `GET
/api/bookmarks/archived/` supports the legacy Linkding search grammar:

- Free text searches title, description, notes, and URL.
- `#tag` filters by tag name; `##tag` is also supported and means the
  same in lax mode.
- Quoted phrases: `"exact phrase"`.
- Boolean: `and`, `or`, `not` (case insensitive). Parentheses are
  honored.
- Special keywords: `!unread` (only unread), `!untagged` (no tags).
- Filters via the search query or as separate query parameters
  (`is_archived`, `unread`, `shared`, `bundle`, `user`, date range).

The user profile controls `tag_search` (`strict` | `lax`) and
`legacy_search` for backward compatibility with older Linkding
installs.

## Response codes

- `200 OK` — success.
- `201 Created` — new resource created.
- `204 No Content` — success with no body.
- `400 Bad Request` — validation failure; body contains an `error`
  field with a short code.
- `401 Unauthorized` — missing or invalid bearer token.
- `403 Forbidden` — token is valid but does not own the resource.
- `404 Not Found` — resource does not exist.
- `409 Conflict` — duplicate URL (returned from `PUT`/`PATCH` on
  `/api/bookmarks/:id/` when the new URL is already used by another
  bookmark of the same owner).

## Source of truth

- Routes: `src/server/api/*.routes.ts`
- Schemas: `src/validation/*.schemas.ts`
- Repository: `src/db/repositories/bookmarks.repo.ts`
- Auth: `src/lib/server/auth/api-token.ts`
