# cloudpin — Deployment Guide

This guide walks through provisioning Cloudflare resources, configuring Cloudflare Access, wiring GitHub Actions, deploying the Worker, and operating the system after launch. It assumes the app under `cloudflare/` is already built and tested locally.

For the architecture and feature roadmap, see `AGENTS.md`. For day-to-day dev commands, see `cloudflare/README.md`.

---

## 1. Prerequisites

| Requirement | Notes |
| --- | --- |
| Cloudflare account | Free tier is enough for a personal deployment; paid features (Queues, Workflows, Browser Rendering) require a paid Workers plan. |
| Cloudflare account ID | Found in the Workers dashboard sidebar. Stored as `CLOUDFLARE_ACCOUNT_ID` in GitHub secrets. |
| Cloudflare API token | **Edit Cloudflare Workers** template at minimum, also include D1/R2/Queues/Workflows scopes if you want CI to manage them. Stored as `CLOUDFLARE_API_TOKEN`. |
| Domain on Cloudflare | Required for custom hostnames and Cloudflare Access. Optional for a `*.workers.dev` deploy. |
| Node.js 20+ and npm 10+ | Local CLI only. Production runs on Cloudflare's workerd runtime. |
| Wrangler 4.95+ | `npx wrangler --version` should report 4.95 or newer. The repo pins this in `cloudflare/package.json`. |

Verify CLI access before going further:

```bash
cd cloudflare
npx wrangler whoami           # must show your account
npx wrangler d1 list          # must list at least your existing D1 DBs
npx wrangler r2 bucket list   # must list at least your existing buckets
```

---

## 2. One-time Cloudflare resource creation

You need three of each resource: one for `local` (used by `wrangler dev`), one for `preview`, and one for `production`. The wrangler config already names them with `-local`, `-preview`, and `-prod` suffixes. Create them once and capture the IDs.

### 2.1 D1 databases

```bash
cd cloudflare

# local D1 is a SQLite file under .wrangler/state/v3/d1 — no remote create needed
# preview
npx wrangler d1 create cloudpin-preview
# production
npx wrangler d1 create cloudpin-prod
```

Each command prints a `database_id`. Paste them into `wrangler.jsonc`:

- `database_id` under `env.preview.d1_databases[0]` → preview value
- `database_id` under `env.production.d1_databases[0]` → production value

### 2.2 R2 buckets

```bash
npx wrangler r2 bucket create cloudpin-assets-preview
npx wrangler r2 bucket create cloudpin-assets-prod
```

`cloudpin-assets-local` is created on demand by Miniflare the first time you run `wrangler dev`. No action needed.

Bucket names already match the wrangler config; no ID edits required.

### 2.3 Queues and dead letter queue

```bash
npx wrangler queues create cloudpin-jobs-preview
npx wrangler queues create cloudpin-jobs-dlq-preview
npx wrangler queues create cloudpin-jobs-prod
npx wrangler queues create cloudpin-jobs-dlq-prod
```

Worker-defined queues and their DLQs must exist before the worker can produce or consume. `cloudpin-jobs-local` and `cloudpin-jobs-dlq-local` are auto-created by `wrangler dev`.

### 2.4 Workflows

Workflows are created automatically the first time the worker is deployed with a workflow binding. No `wrangler` create step needed. The names `cloudpin-import-*` and `cloudpin-snapshot-*` are baked into `wrangler.jsonc` and will be created on first deploy.

### 2.5 Verify wrangler.jsonc

After edits, regenerate the Worker types and confirm everything resolves:

```bash
npx wrangler types
git diff worker-configuration.d.ts   # review the new PreviewEnv/ProductionEnv entries
```

The generated `worker-configuration.d.ts` should now contain real D1, R2, and Queue IDs for `Cloudflare.PreviewEnv` and `Cloudflare.ProductionEnv`. Commit the regenerated file.

---

## 3. Cloudflare Access setup

Cloudflare Access is the browser identity layer. API routes can be deployed with Access bypassed (compatibility mode, default) or enforced (strict mode, optional).

### 3.1 Create the Access application

In the Cloudflare Zero Trust dashboard:

1. **Access → Applications → Add an application → Self-hosted**.
2. Name: `cloudpin`.
3. Session duration: 24 hours (or your preference).
4. Application domain: the hostname you will deploy to (e.g. `app.example.com`).
5. **Identity providers**: enable "One-time PIN" at minimum; add Google/GitHub/Okta if desired.
6. **Policies**: create a policy named `allow-members` that requires:
   - **Emails** contains your admin email (matches `ADMIN_EMAILS`), OR
   - **Emails ending in** your domain (for org-wide access)
7. Save and note the **Application Audience (AUD)** tag. It looks like `a1b2c3d4e5f6...`.

### 3.2 Note the team domain

The team domain is the `*.cloudflareaccess.com` hostname shown on the Zero Trust dashboard sidebar (Settings → Custom Pages → Domain). It looks like `myteam.cloudflareaccess.com`.

### 3.3 Public shared routes (optional)

If you want bookmark sharing to work for users outside your org, add a second Access application on a separate hostname (e.g. `share.example.com`) with **no policies** so Access allows anonymous traffic. The application code still enforces shared/public checks. See `AGENTS.md` → "Target Architecture → Suggested route protection".

### 3.4 Wire Access into wrangler.jsonc

Replace the placeholders in `wrangler.jsonc`:

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "myteam.cloudflareaccess.com",
  "ACCESS_AUD": "a1b2c3d4e5f6...",
  "ADMIN_EMAILS": "you@example.com,partner@example.com"
}
```

For `env.preview` and `env.production`, use the same `ACCESS_TEAM_DOMAIN` but separate `ACCESS_AUD` values (each Access application has its own AUD).

---

## 4. Secrets

Secrets are set per environment with `wrangler secret put` and are never committed.

### 4.1 Generate `APP_SECRET`

`APP_SECRET` is the HMAC key for session cookies and CSRF tokens. Generate it once and reuse across envs:

```bash
openssl rand -base64 48
```

### 4.2 Set secrets on each environment

```bash
cd cloudflare

# local: secrets come from a .dev.vars file in the cloudflare/ dir
cat > .dev.vars <<'EOF'
APP_SECRET=replace-me
EOF

# preview
echo "replace-me" | npx wrangler secret put APP_SECRET --env preview

# production
echo "replace-me" | npx wrangler secret put APP_SECRET --env production
```

Add additional secrets the same way (e.g. `WAYBACK_ACCESS_KEY` for Internet Archive integration, `API_TOKEN_PEPPER` if you choose to pepper API token hashes). The wrangler config does not need to know about them — only the code that reads them.

### 4.3 Verify

```bash
npx wrangler secret list --env production
```

---

## 5. Local development

```bash
cd cloudflare
npm install
npx wrangler types                            # populate worker-configuration.d.ts
npm run db:migrate:local                      # apply migrations to the local D1
npm run dev                                   # starts on http://localhost:8787
```

Hit `http://localhost:8787/api/health` — you should see `{"status":"ok","service":"cloudpin"}`.

The Cloudflare Access middleware is bypassed in dev by default; see `src/auth/access-jwt.ts` (added in Phase 2) for the dev-mode toggle.

---

## 6. CI/CD via GitHub Actions

The repo includes two workflows under [`.github/workflows/`](.github/workflows/) (repo root; all steps use `working-directory: cloudflare`):

- `ci.yml` — runs on pull requests. Steps: `npm ci` → `wrangler types` → `typecheck` → `lint` → `test` → `build`. No secrets required.
- `deploy.yml` — runs on push to `main`. Same quality gates, then `wrangler d1 migrations apply DB --remote --env production` and `wrangler deploy --env production`.

### 6.1 Required GitHub repository secrets

Set in the GitHub UI under **Settings → Secrets and variables → Actions**:

| Secret | What to put |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from §1. |
| `CLOUDFLARE_API_TOKEN` | API token with at minimum: Workers Scripts:Edit, Workers KV Storage:Edit, D1:Edit, R2:Edit, Queues:Edit, Workers Workflows:Edit. |

### 6.2 Branch protection (recommended)

In GitHub **Settings → Branches**, add a rule on `main` that requires the `test` job from `ci.yml` to pass before merging. This prevents broken code from reaching `deploy.yml`.

### 6.3 Preview environments on PRs (optional)

To deploy every PR to its own Cloudflare Workers subdomain, add a third workflow that uses the PR branch name as the worker name and writes deployment URLs back to the PR. The wrangler config already supports `env.preview` for shared preview deployments; per-PR subdomains require a `wrangler deploy --name cloudpin-pr-${{ github.event.pull_request.number }}` step.

---

## 7. Manual deploy (no CI)

Useful for one-off production pushes or for disaster recovery when CI is broken.

```bash
cd cloudflare

# 1. Quality gates (must pass)
npm run typecheck
npm run lint
npm test
npm run build

# 2. Apply pending D1 migrations
npx wrangler d1 migrations apply DB --remote --env production

# 3. Deploy the Worker
npx wrangler deploy --env production
```

Wrangler prints the deployed URL. To deploy the preview environment:

```bash
npx wrangler d1 migrations apply DB --remote --env preview
npx wrangler deploy --env preview
```

---

## 8. Custom hostname

The default deploy lives at `cloudpin.<your-subdomain>.workers.dev`. To use your own domain:

### 8.1 In the Cloudflare dashboard

1. **Workers & Pages → cloudpin → Settings → Triggers → Custom Domains → Add**.
2. Enter `app.example.com`.
3. Cloudflare will automatically create the DNS record (if the zone is on Cloudflare) or give you a CNAME target to add.

### 8.2 In Cloudflare Access

If you have not already, set the Access application's domain to the custom hostname (see §3.1). The old `*.workers.dev` URL should not be used in production; either delete the Access app for it or add a deny policy.

---

## 9. Post-deploy verification

Run these checks after every production deploy:

```bash
# 1. Health endpoint
curl -fsS https://app.example.com/api/health
# expected: {"status":"ok","service":"cloudpin"}

# 2. Access login flow
# In a private browser window, open https://app.example.com/.
# You should be redirected to Cloudflare Access, complete auth, and land on the app.

# 3. D1 row counts (sanity check after migrate)
npx wrangler d1 execute DB --remote --env production --command \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# expected: 11 table names (bookmark_assets, bookmark_bundles, bookmark_tags, bookmarks,
#  feed_tokens, global_settings, tags, toasts, user_profiles, users, plus
#  sqlite_sequence and any d1_migrations bookkeeping)

# 4. R2 bucket exists
npx wrangler r2 bucket list | grep cloudpin-assets-prod
```

If any of these fail, do not roll users over to the new deployment. See §11 for rollback.

---

## 10. Backups

### 10.1 D1 Time Travel

D1 retains 30 days of point-in-time recovery by default on paid plans, 7 days on free. To restore:

```bash
# Find the timestamp to restore to
npx wrangler d1 time-travel info DB --env production

# Restore to that timestamp (creates a new DB; you must swap the binding)
npx wrangler d1 time-travel restore DB --env production --timestamp "2026-06-01T00:00:00Z"
```

A safer routine is to take an export before risky changes:

```bash
npx wrangler d1 export DB --remote --env production --output backups/cloudpin-$(date -u +%Y%m%dT%H%M%SZ).sql
```

Wire this into a daily cron (Cloudflare Workflow scheduled trigger, or GitHub Actions cron) to keep a rolling 30-day archive of SQL dumps in R2.

### 10.2 R2 lifecycle

R2 is durable by default; objects are not lost on deploy. For cost control, add a lifecycle rule that expires old generated exports and import staging files:

```bash
# Example: expire files under exports/ and imports/ older than 30 days
# Configured in the Cloudflare dashboard under R2 → cloudpin-assets-prod → Settings → Lifecycle rules.
```

User-uploaded assets and snapshots should be retained indefinitely (or until the user deletes them).

---

## 11. Rollback

### 11.1 Worker code

Wrangler keeps the last few deployments available for instant rollback.

```bash
# List recent deployments
npx wrangler deployments list --env production

# Roll back to a specific version
npx wrangler deployments rollback <deployment-id> --env production
```

The current production traffic is restored within seconds. The rolled-back version stays live until you deploy a new one.

### 11.2 D1 schema

D1 migrations are append-only. Only forward-only migrations are safe to apply; never edit a shipped migration. To "roll back" a schema change:

1. Write a new migration that reverses the change (e.g. `ALTER TABLE ... DROP COLUMN ...`).
2. Apply it through the normal `wrangler d1 migrations apply` flow.
3. Update the code to no longer reference the removed column.
4. Deploy the updated worker.

If a migration catastrophically corrupts data, restore from a Time Travel export (see §10.1).

### 11.3 R2

R2 objects are append-only for the app's purposes; do not run destructive cleanup jobs during or after a deploy. To recover from a bad delete, restore the bucket from the last SQL export that records R2 keys.

---

## 12. Monitoring

### 12.1 Workers Logs

Workers Logs are enabled in `wrangler.jsonc` under `observability.enabled`. View them in the Cloudflare dashboard under **Workers & Pages → cloudpin → Logs**. Filter by `Outcome:Error` and `Script:cloudpin` for a clean signal.

### 12.2 Structured logs

Application code should emit one JSON object per log line, including:

```json
{
  "ts": "2026-06-01T12:00:00.000Z",
  "level": "info",
  "requestId": "...",
  "userId": 1,
  "route": "/api/bookmarks/",
  "durationMs": 42,
  "status": 200
}
```

Set up logpush to forward to a third-party aggregator (Datadog, Honeycomb, etc.) for retention beyond the Workers Logs window.

### 12.3 DLQ alerts

The job queue has a dead letter queue (`cloudpin-jobs-dlq-prod`). Cloudflare will surface a count of DLQ messages in the dashboard under **Workers & Pages → Queues**. Configure an alert (or poll the count) so a stuck message is noticed within a day.

### 12.4 Workflow failures

Workflows are inspected per instance in **Workers & Pages → Workflows → cloudpin-import-prod → Instances**. Add a check that runs `wrangler workflows instances list cloudpin-import-prod --limit 50` (or the dashboard equivalent) for non-`succeeded` / non-in-progress states.

### 12.5 API error rates

Watch the Workers Logs aggregate of `status >= 500` and `status == 401`/`403`. Sudden spikes usually mean either a bad deploy or a credential leak. The health endpoint in §9 is the simplest canary.

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `wrangler d1 migrations apply` fails with "no migrations folder" | `migrations_dir` not set or path wrong | Confirm `wrangler.jsonc` has `"migrations_dir": "migrations"` and you ran from `cloudflare/`. |
| `Error: Invalid D1 database id` | Placeholder `database_id` still in `wrangler.jsonc` | Run `wrangler d1 create <name>` for each env and paste the real id. |
| `wrangler dev` cannot find `ASSETS_BUCKET` | Bucket binding missing for local | R2 in local mode is auto-created by Miniflare; restart `wrangler dev` after a clean of `.wrangler/`. |
| `wrangler deploy` fails with "queue not found" | Queue or DLQ not created | Run the `wrangler queues create` commands in §2.3. |
| Access login redirects to a loop | `ACCESS_AUD` mismatch | The Access application's AUD must match `ACCESS_AUD` in `wrangler.jsonc` for the deployed env. |
| `403` on `/api/*` | `ADMIN_EMAILS` empty and Access is enforcing the API | Either add admins via `ADMIN_EMAILS` or attach an Access Service Auth policy. |
| `/api/health` returns 404 | Hono not mounted at `/api/[...path]` | Confirm the route file exists at `src/routes/api/[...path]/+server.ts` and that `run_worker_first` includes `/api/*` (added in Phase 0 of `AGENTS.md`). |
| Build succeeds but `wrangler deploy` uploads old code | Stale `.svelte-kit/cloudflare/_worker.js` | Delete `.svelte-kit/` and re-run `npm run build` before deploying. |
| Typecheck fails after a successful `npm run build` | tsc is walking the generated `.svelte-kit/output/` | Run `npm run typecheck` before `npm run build` (the CI workflow does this). |
| D1 query returns `SqliteError: no such column` | Migration not applied to remote | `wrangler d1 migrations apply DB --remote --env production`. |

---

## 14. Operational runbook (cheat sheet)

```bash
# Daily
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT COUNT(*) FROM bookmarks;"

# Weekly: rotate API tokens in the app, audit DLQ count.

# Per release
npm run typecheck && npm run lint && npm test && npm run build
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler deploy --env production
curl -fsS https://app.example.com/api/health
# If health fails:
npx wrangler deployments rollback <last-good-id> --env production
```

That's the full loop. Keep this file up to date as the architecture evolves; when Phase 7/8 add R2 assets and snapshot workflows, extend §12 with their specific alerts.
