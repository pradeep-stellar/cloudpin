# Production runbook

This runbook covers day-2 operations for a cloudpin deployment on Cloudflare.

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
