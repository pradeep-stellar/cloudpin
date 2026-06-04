# cloudpin

A Cloudflare-native bookmark manager. A from-scratch reimplementation of [Linkding](https://linkding.link/) as a single TypeScript app on Cloudflare Workers, D1, R2, Queues, and Workflows — built and operated by one person with AI coding help.

## Status

The project is mid-build. See [`AGENTS.md`](AGENTS.md) for the full plan, phase breakdown, feature parity matrix, security checklist, and operational runbooks.

| Phase | Scope                                                | Status      |
| ----- | ---------------------------------------------------- | ----------- |
| 0     | SvelteKit + Hono on Workers, Wrangler config         | done        |
| 1     | Core domain (URL normalize, tags, search) and D1 schema | done     |
| 2+    | Auth, REST API, UI, jobs, assets, snapshots, migration | in progress |

## Where to look

| You want to…                                | Read                                          |
| ------------------------------------------- | --------------------------------------------- |
| Understand the architecture and roadmap     | [`AGENTS.md`](AGENTS.md)                      |
| Deploy to Cloudflare                        | [`DEPLOYMENT.md`](DEPLOYMENT.md)              |
| Run the app locally                         | [`cloudflare/README.md`](cloudflare/README.md) |
| Find a command quickly                      | `cd cloudflare && make help`                  |
| See the original Linkding behavior          | the [Linkding repo](https://github.com/sissbruecker/linkding) |

## Quick start

Prerequisites: Node.js 20+, npm 10+, a Cloudflare account (only needed for remote `dev`, `db:migrate:remote:*`, and `deploy`).

```bash
cd cloudflare
make setup     # install deps, generate Worker types, apply local D1 migrations
make dev       # http://localhost:8787
make test      # unit tests
make ci        # typecheck + lint + test + build (what CI runs)
```

Common targets: `make dev-remote`, `make test-e2e`, `make db-reset`, `make db-shell`, `make deploy`, `make tail`. Run `make help` for the full list.

## Repo layout

```
.
├── AGENTS.md             Architecture, feature parity matrix, phases, runbooks
├── DEPLOYMENT.md         Cloudflare provisioning, Access, GitHub Actions, operations
├── cloudflare/           The cloudpin application (SvelteKit + Hono on Workers)
│   ├── README.md         Local development guide
│   ├── Makefile          Local command runner (run `make help`)
│   ├── wrangler.jsonc    Wrangler config (local / preview / production)
│   ├── package.json
│   ├── src/              App code: routes, domain logic, db, auth, jobs, storage
│   ├── migrations/       D1 SQL migrations
│   └── test/             unit / integration / e2e / fixtures
└── .beads/               Local issue tracker (bd) — see AGENTS.md for the bd workflow
```

## What "cloudpin" is and isn't

- It is a self-hostable bookmark manager with a server-rendered UI, REST API, RSS feeds, PWA manifest, import/export, tags, bundles, sharing, and asset/snapshot support.
- It is not a line-for-line port of Linkding. The goal is feature parity where it matters to users and a simpler operational model for one maintainer.
- Server-side SingleFile HTML snapshots and other browser-heavy work are rebuilt using Cloudflare Browser Rendering, with a Cloudflare Container as a future fallback. See `AGENTS.md` for the snapshot strategy and known trade-offs.

## License

Personal project. License TBD.
