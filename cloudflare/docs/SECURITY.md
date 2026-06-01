# Security checklist

The current deployment assumes Cloudflare Access is in front of the app
and the `/api/*` routes are gated by app bearer tokens. Verify the
following before going to production.

## Authentication

- [ ] `ACCESS_TEAM_DOMAIN` is set in production.
- [ ] `ACCESS_AUD` matches the Cloudflare Access application audience tag.
- [ ] `APP_SECRET` is at least 32 bytes of high-entropy randomness.
- [ ] `ADMIN_EMAILS` contains only the operator email(s).
- [ ] Access policy on `app.example.com/*` requires SSO.
- [ ] `/api/*` is in an Access application with **bypass** policy and
      requires an app bearer token.

## Session & CSRF

- [ ] Browser session cookies are `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] App session cookies have a 30-day TTL.
- [ ] CSRF tokens are validated for every mutating browser request.
- [ ] API token requests bypass CSRF but require bearer auth.
- [ ] The HMAC CSRF token uses `APP_SECRET` and the user's session id.

## Tokens

- [ ] API tokens are 32 random bytes, base64url-encoded, with prefix
      only displayed in the UI.
- [ ] Token hashes use SHA-256 with optional `API_TOKEN_PEPPER`.
- [ ] Tokens are shown to the user exactly once at creation.
- [ ] Token revocation is immediate and removes the row.
- [ ] Feed tokens are 32 random bytes and rotated on demand.
- [ ] Constant-time comparison is used to match token hashes.

## Data access

- [ ] All mutations check `owner_id = :current_user_id` at the SQL level.
- [ ] `bookmarks/check?url=…` does not leak other users' URLs.
- [ ] `feeds/[all|shared]` requires a valid feed token.
- [ ] `feeds/shared` only returns `shared = 1` bookmarks.
- [ ] `/api/bookmarks/:id/assets/:assetId` checks the owner of the
      bookmark before serving the asset.
- [ ] `/custom_css` requires a valid feed token.

## Input validation

- [ ] All Zod schemas reject unknown keys.
- [ ] URL inputs are parsed and rejected if not `http(s)`.
- [ ] File uploads have a hard 20 MB cap and a content-type allowlist.
- [ ] Search queries are bounded in length (e.g., 200 chars).
- [ ] Tag names are normalized to `[a-z0-9-_]`.

## Network

- [ ] `bookmarks/check` is rate-limited via Cloudflare WAF.
- [ ] `POST /api/bookmarks/singlefile` is rate-limited.
- [ ] `POST /settings/import` is rate-limited.
- [ ] All Worker responses include `X-Content-Type-Options: nosniff`.
- [ ] Snapshot assets set a strict CSP based on content type.

## Operations

- [ ] Workers Logs is enabled.
- [ ] DLQ is monitored; alert on count > 0.
- [ ] D1 Time Travel retention is at the default 30 days.
- [ ] R2 lifecycle rules remove stale `imports/` and `exports/` files.
- [ ] No secrets are logged.
- [ ] No bearer tokens are logged.

## Out of scope

- Multi-tenant separation is not implemented. If the deployment grows
  beyond a single user or small team, plan for a per-user D1 schema.
- Public sharing on a shared hostname requires a separate `share.*`
  hostname to keep Access policy simple.
