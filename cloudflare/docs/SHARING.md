# Public sharing

This document describes the public sharing surface for cloudpin: how to
expose a read-only view of selected bookmarks and their assets on a
separate hostname that is not protected by Cloudflare Access.

## Goals

- A user can mark a bookmark as **shared** so the bookmark metadata
  (title, description, notes, URL, tags) appears on the public share
  host.
- A user can mark their profile as **public sharing enabled** so
  uploaded assets and snapshots are also served from the public share
  host.
- The public share host serves only public data. There is no login UI,
  no admin UI, no API mutation surface. Everything else returns 404.
- The private app host (`app.example.com`) is still behind Cloudflare
  Access and never serves public-only data.

## Topology

Two hostnames, one Worker, two access policies:

```text
app.example.com   → behind Cloudflare Access (browser identity required)
share.example.com → public, no Access; only /public/* and /health are served
```

Both hostnames route to the same Worker. The Worker uses the
`PUBLIC_HOSTNAME` environment variable to tell them apart and applies a
hostname-based path allowlist.

## Configuration

`wrangler.jsonc` declares the env var per environment:

```jsonc
{
  "vars": {
    "PUBLIC_HOSTNAME": ""
  },
  "env": {
    "preview": {
      "vars": {
        "PUBLIC_HOSTNAME": "share-preview.example.com"
      }
    },
    "production": {
      "vars": {
        "PUBLIC_HOSTNAME": "share.example.com"
      }
    }
  }
}
```

Leave `PUBLIC_HOSTNAME` empty in local dev to disable the gate. The
e2e bypass (`CLOUDPIN_E2E_BYPASS_AUTH=1`) also disables the gate so
Playwright can hit the private app under its own host header.

## Path allowlist

`src/domain/hostname-routing.ts` decides, given the request URL and
the configured public hostname, whether the request should be served
or 404'd. Today the only public path is `/public/*`, with `/health`
reserved for the same-host health check. The list is centralized in
`PUBLIC_ALLOWED_PATHS` so adding `/feeds/shared` or
`/bookmarks/shared` is a one-line change.

The hostname gate runs in `hooks.server.ts` before auth resolution, so
a public-host 404 never spends a D1 query on auth lookup.

## /public/assets/{id}

The only public route shipped today. Returns the bytes of a
`bookmark_assets` row that meets **all** of:

1. `bookmark_assets.status = 'complete'`
2. `bookmarks.shared = 1` (the parent bookmark is shared)
3. `user_profiles.enable_public_sharing = 1` (the owner opted in)

The access decision lives in
`src/domain/public-asset-access.ts` and is intentionally stricter than
the owner-facing `decideAssetAccess` in `src/domain/asset-access.ts`:

- `bookmarks.shared = 0` → 403 (the bookmark is private, full stop)
- `enable_public_sharing = 0` → 403 (the owner has the public surface
  off)
- missing asset / bookmark / profile → 404 (not 200, not 403)
- asset still uploading or in a failure state → 409

The 403-vs-404 distinction matters: a 403 tells the caller "this asset
exists, but the owner has chosen not to expose it publicly" while a
404 means "I cannot find this asset". The owner-facing route
(`/assets/{id}`) collapses both into 404 to avoid leaking existence;
the public route can be more honest because existence is already
implicit in the URL the caller was given.

The response carries strict, content-type-aware CSP:

- HTML snapshots: `sandbox allow-scripts`
- PDF: `default-src 'none'; object-src 'self';`
- Video: `default-src 'none'; media-src 'self';`
- Everything else: a default-deny with self-only

`Cache-Control` is `public, max-age=300` for non-image content and
`public, max-age=3600` for images, so the Cloudflare edge cache can
absorb traffic to popular shared assets.

## Authentication and authorization

The public route never reads the bearer token, never inspects
`Cf-Access-Jwt-Assertion`, and never sets a session. All identity is
derived from the URL itself and the D1 row. The Cloudflare Access
policy on the public hostname is a no-op (or a WAF rule, if you
prefer); the Worker is the source of truth for who is allowed to see
what.

## Deployment

1. Add the share hostname as a Cloudflare Worker route:
   `share.example.com/*` → this Worker.
2. Set the Access policy for `share.example.com` to **allow all** (or
   set a WAF rule if you want to rate-limit anonymous traffic).
3. Set the Access policy for `app.example.com` to require your team
   email domain.
4. Configure `PUBLIC_HOSTNAME` in the Worker's environment variables
   (see the `wrangler.jsonc` snippet above).
5. Run `wrangler deploy --env production`.

## Roadmap

- `/public/bookmarks/{id}` and `/public/bookmarks/shared` for
  read-only bookmark metadata on the share host.
- `/public/feeds/shared/{token}` for public RSS/Atom feeds.
- Optional per-share-link token so a single shared bookmark can be
  revoked without disabling public sharing globally.
- A `global_settings` flag to enable/disable the public hostname gate
  per deployment (right now the gate is purely a config var).
