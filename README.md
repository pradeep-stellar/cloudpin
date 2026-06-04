# cloudpin

A Cloudflare-native bookmark manager. A from-scratch reimplementation of [Linkding](https://linkding.link/) as a single TypeScript app on Cloudflare Workers, D1, R2, and Queues — built and operated by one person with AI coding help.

## Status

**Feature-complete for personal use; not yet production-deployed by default.** The app under `cloudflare/` implements most of the roadmap in [`AGENTS.md`](AGENTS.md). Background work runs on **Queues** (not Cloudflare Workflows). Netscape import is **synchronous** in the Worker today.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | SvelteKit + Hono on Workers, Wrangler config | **done** |
| 1 | Core domain (URL normalize, tags, search) and D1 schema | **done** |
| 2 | Cloudflare Access JWT, CSRF, API tokens, user upsert | **done** |
| 3 | REST API (bookmarks, tags, assets, profile) | **partial** — bundles API not implemented yet |
| 4 | Core UI (active / archived / shared, create / edit / details) | **done** |
| 5 | Tags, bundles, bulk actions | **done** (tag merge on tags page; bundle preview route) |
| 6 | Settings, feeds, PWA, import/export | **partial** — import is inline, not queued |
| 7 | R2 assets, queue consumer, favicon/preview/metadata jobs | **done** |
| 8 | Wayback, SingleFile upload, snapshot jobs (Browser Rendering) | **partial** — queue-based snapshots; fidelity ≠ SingleFile CLI |
| 9 | Migration tool and cutover docs | **partial** — `tools/migrate-linkding.ts`, [`cloudflare/docs/CUTOVER.md`](cloudflare/docs/CUTOVER.md) |
| 10 | Hardening (e2e, runbooks, security docs) | **partial** — 324 unit + 19 Playwright tests; more API contract coverage planned |

**Quality gates (local):** `cd cloudflare && make ci` — typecheck, lint, unit tests, build. E2e: `make test-e2e` (19 specs).

**Deploy readiness:** One-time Cloudflare setup, real `wrangler.jsonc` IDs, Access, and secrets are documented in [`DEPLOYMENT.md`](DEPLOYMENT.md). GitHub Actions workflows live under `cloudflare/.github/workflows/` today; copy or symlink them to the **repository root** `.github/workflows/` before push-to-deploy on `main` will run in GitHub.

### What works today

- Server-rendered bookmark UI with search (including FTS5), tag cloud, filters, pagination, bulk edit
- Tags (rename, merge, delete) and bundles (create, edit, reorder, preview)
- Settings, API/feed tokens, custom CSS, OpenSearch, PWA manifest
- Compatible REST API for bookmarks, tags, assets, and profile (`Authorization: Token` / `Bearer`)
- RSS/Atom feeds, Netscape HTML import/export
- R2-backed favicons, previews, uploads; queue jobs for metadata, Wayback, snapshots
- Markdown notes (sanitized), public sharing hostname routing (see [`cloudflare/docs/SHARING.md`](cloudflare/docs/SHARING.md))

### Known gaps before calling it “shipped”

- `/api/bundles/*` REST routes
- Admin-lite UI (rely on D1 dashboard for raw SQL for now)
- Async / resumable Netscape import (large files)
- GitHub Actions at repo root; replace placeholder D1 IDs and Access vars in `wrangler.jsonc`
- Optional hardening from ongoing review: API token lookup by prefix, stale pending asset cleanup

## Where to look

| You want to… | Read |
| ------------ | ---- |
| Architecture, parity matrix, security checklist | [`AGENTS.md`](AGENTS.md) |
| Deploy to Cloudflare | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Day-2 ops, env vars, queue behavior | [`cloudflare/docs/RUNBOOK.md`](cloudflare/docs/RUNBOOK.md) |
| Run the app locally | [`cloudflare/README.md`](cloudflare/README.md) |
| Find a command quickly | `cd cloudflare && make help` |
| Original Linkding behavior | [Linkding repo](https://github.com/sissbruecker/linkding) |

## Quick start

Prerequisites: Node.js 20+, npm 10+, a Cloudflare account (only needed for remote `dev`, `db:migrate:remote:*`, and `deploy`).

```bash
cd cloudflare
make setup     # install deps, generate Worker types, apply local D1 migrations
make dev       # http://localhost:8787
make test      # unit tests
make ci        # typecheck + lint + test + build
```

Common targets: `make dev-remote`, `make test-e2e`, `make db-reset`, `make db-shell`, `make deploy`, `make tail`. Run `make help` for the full list.

Local auth uses Cloudflare Access in production. For e2e and some local flows, set `CLOUDPIN_E2E_BYPASS_AUTH=1` in `cloudflare/.dev.vars` (see `cloudflare/README.md`).

## Repo layout

```
.
├── AGENTS.md             Architecture, feature parity matrix, phases, runbooks
├── DEPLOYMENT.md         Cloudflare provisioning, Access, GitHub Actions, operations
├── cloudflare/           The cloudpin application (SvelteKit + Hono on Workers)
│   ├── README.md         Local development guide
│   ├── docs/             RUNBOOK, SECURITY, API, SHARING, CUTOVER, SEARCH-PERF
│   ├── Makefile          Local command runner (run `make help`)
│   ├── wrangler.jsonc    Wrangler config (local / preview / production)
│   ├── package.json
│   ├── src/              Routes, domain logic, db, auth, jobs, storage, API
│   ├── migrations/       D1 SQL migrations
│   └── test/             unit / integration / e2e / fixtures
└── .beads/               Local issue tracker (bd) — see AGENTS.md for the bd workflow
```

## What "cloudpin" is and isn't

- It is a self-hostable bookmark manager with a server-rendered UI, REST API, RSS feeds, PWA manifest, import/export, tags, bundles, sharing, and asset/snapshot support.
- It is not a line-for-line port of Linkding. The goal is feature parity where it matters to users and a simpler operational model for one maintainer.
- Server-side HTML snapshots use Cloudflare Browser Rendering via queue jobs, not the SingleFile CLI. Browser SingleFile upload is supported on the API. See `AGENTS.md` for trade-offs.

## License

Personal project. License TBD.