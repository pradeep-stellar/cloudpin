# Production runbook

This runbook covers day-0 setup, day-1 deploy, and day-2 operations
for a cloudpin deployment on Cloudflare.

## First-time setup

Before the first deploy, three Cloudflare resources need to exist per
environment: a D1 database, an R2 bucket, and a queue with a dead
letter queue. Browser Rendering is a binding and needs no
pre-creation. Access is configured in the dashboard.

### Background jobs (canonical paths)

- **Netscape import:** `POST /settings/import` parses the upload in the
  Worker and writes bookmarks directly to D1 (synchronous; large files
  should move to a queue in a later phase).
- **Snapshots / favicons / previews / metadata / Wayback:** Cloudflare
  Queues consumer (`src/jobs/queue-consumer.ts`) via `snapshot.create`,
  `favicon.load`, `preview.load`, `metadata.refresh`, and `wayback.create`
  messages. Workflows bindings were removed; queues are the durable path.

The `tools/bootstrap.sh` script creates all of these idempotently
(returns the existing ID if the resource already exists) and prints
the values to paste into `wrangler.jsonc`.

### Prereqs

- A Cloudflare account with Workers, D1, R2, Queues, and Browser
  Rendering enabled.
- `npx wrangler` installed and able to reach your account (set
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
  environment, or run `wrangler login`).
- `jq` installed (`brew install jq` / `apt install jq`).
- Node 20+.

### Steps

1. From the `cloudflare/` directory, run the bootstrap script for each
   environment you want to deploy. Use `--all` to do all three in one
   pass:

   ```bash
   tools/bootstrap.sh --all
   # or one at a time:
   tools/bootstrap.sh production
   tools/bootstrap.sh preview
   tools/bootstrap.sh local
   ```

   The script prints `<env>:<d1_id>` on the last line of each
   environment block. Capture that.

2. Paste the D1 `database_id` values into `cloudflare/wrangler.jsonc`
   under each env. R2 buckets and queues use the names from the
   script, so no further changes are required for those.

3. Create the production Access application in the Cloudflare
   dashboard (**Access → Applications → Add an application →
   Self-hosted**). Configure the policy to require your team email
   domain. Note the audience tag and team domain.

4. Update the Access env vars in `cloudflare/wrangler.jsonc`:

   ```jsonc
   "env": {
     "production": {
       "vars": {
         "ACCESS_TEAM_DOMAIN": "<your-team>.cloudflareaccess.com",
         "ACCESS_AUD":         "<audience tag from the Access app>",
         "ADMIN_EMAILS":       "owner@example.com"
       }
     }
   }
   ```

5. Set the production secrets interactively. The values are never
   stored in the repo:

   ```bash
   npx wrangler secret put APP_SECRET         --env production
   npx wrangler secret put API_TOKEN_PEPPER   --env production
   npx wrangler secret put WAYBACK_ACCESS_KEY --env production  # optional
   ```

6. Apply migrations and deploy:
   ```bash
   npx wrangler d1 migrations apply DB --remote --env production
   npx wrangler deploy --env production
   ```

The script is safe to re-run: existing resources are detected and
their IDs are returned without modification. It never deletes
anything.

### Local development

`tools/bootstrap.sh local` (or `--all`) creates the D1, R2, and
queue resources that `wrangler dev` will use. The `database_id` for
the local env is only required for `wrangler dev` to find the right
local D1; the `--local` flag also creates a fresh D1 on disk under
`.wrangler/state/` if no remote ID is set.

## Deploy

The Worker, D1, and R2 bucket are all deployed via Wrangler from CI. The
CI pipeline lives in `.github/workflows/deploy.yml`.

Trigger a deploy by merging to `main`. The pipeline:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`
5. `npm run build`
6. `npx wrangler d1 migrations apply cloudpin-prod --remote`
7. `npx wrangler deploy --env production`

If any step fails, the deploy does not proceed. Inspect the GitHub Actions
log for the failing step.

## Verify a deploy

1. Check that the Worker URL responds:
   ```bash
   curl -fsS https://app.example.com/api/health
   ```
2. Check Workers Logs in the Cloudflare dashboard for startup errors.
3. Sign in via Cloudflare Access and confirm the bookmarks list loads.

## Rollback

Worker code is versioned automatically. Roll back via the Cloudflare
dashboard (**Workers & Pages → cloudpin → Deployments → Rollback**) or
with the CLI:

```bash
wrangler rollback --env production
```

D1 has Time Travel enabled by default. To roll back a destructive D1
change, export a snapshot of the previous state with the D1 Time Travel
API or via Wrangler, then restore it.

R2 objects are append-only for assets; do not delete data in a rollback.
If a R2 bucket configuration change is needed, prefer adding a new
prefix over mutating existing keys.

## Monitoring

- Workers Logs is enabled via `wrangler.jsonc`. View structured JSON
  logs in the Cloudflare dashboard.
- Set up Cloudflare Notifications for:
  - Queue DLQ count > 0 (failed jobs after retries)
  - 5xx error rate > 1% over 5 minutes
  - Worker CPU time near limits
- Check the D1 dashboard for read/write ratios and latency.

## Backups

D1 does not need a separate backup — Time Travel covers point-in-time
recovery for the last 30 days. For longer-term backup:

1. Use the D1 export API or a periodic `wrangler d1 export` to dump
   the database to R2.
2. Store exports in the `backups/` prefix of an R2 bucket with a
   lifecycle rule of 365 days.

R2 already provides high durability. The D1 export is the only piece
that needs explicit backup.

## Restore from backup

1. List the available backups:
   ```bash
   wrangler r2 object get backups/d1-2024-01-01.sql --bucket=cloudpin-backups
   ```
2. Import into D1 (D1 does not have a direct `import` command; use
   `wrangler d1 execute` to replay the SQL):
   ```bash
   cat backup.sql | wrangler d1 execute cloudpin-prod --file=- --remote
   ```
3. Verify the import with counts:
   ```bash
   wrangler d1 execute cloudpin-prod --command="SELECT 'bookmarks' as t, COUNT(*) FROM bookmarks UNION ALL SELECT 'tags', COUNT(*) FROM tags" --remote
   ```

## Database migrations

- Migrations live in `cloudflare/migrations/`.
- They are forward-only. Never edit a shipped migration.
- Rollback means writing a new migration that reverses the schema change.
- Apply locally with `wrangler d1 migrations apply DB --local` during
  development. Apply to remote via CI on `main`.
- Inspect the current applied version with:
  ```bash
  wrangler d1 migrations list cloudpin-prod --remote
  ```

## Secrets

Secrets are configured via:

```bash
wrangler secret put APP_SECRET --env production
wrangler secret put API_TOKEN_PEPPER --env production
```

You can also set them through the Cloudflare dashboard under
**Workers & Pages → cloudpin → Settings → Variables and Secrets**.

## Queue health

If the DLQ starts filling up:

1. Check the DLQ messages:
   ```bash
   wrangler queues consumer list
   ```
2. Inspect the dead-letter messages via the Cloudflare dashboard.
3. Common causes: malformed URLs (404), Wayback rate limiting, R2
   transient errors. Replay the messages once the underlying issue is
   fixed by copying them back to the main queue.

## Cost guardrails

- D1 row counts: stay under 5 GB per database for a single user.
- R2 lifecycle: set lifecycle rules on `imports/` and `exports/` prefixes
  to expire staged files after 7 days.
- Workers CPU time: avoid loops over large datasets in request handlers.
  All batch processing must go through the queue.
