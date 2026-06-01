# Cutover checklist

Use this checklist when migrating an existing Linkding (Django) installation
to cloudpin on Cloudflare.

## 1. Prepare the source

1. Log in to the existing Linkding app.
2. Generate a new API token for migration if you want to script things, or
   skip this step if you are only importing the Netscape export.
3. In Linkding, go to **Settings** and download the bookmarks export
   (`bookmarks.html`).

## 2. Deploy cloudpin

1. Create the D1 database, R2 bucket, and Queue in the Cloudflare dashboard
   or via Wrangler.
2. Apply the migrations:
   ```bash
   npx wrangler d1 migrations apply cloudpin-prod --remote
   ```
3. Set the required secrets:
   - `APP_SECRET`
   - `ACCESS_AUD` (Cloudflare Access application audience tag)
   - `API_TOKEN_PEPPER` (optional, for peppering API token hashes)
4. Deploy the Worker:
   ```bash
   npx wrangler deploy --env production
   ```
5. Verify the deployment is healthy:
   ```bash
   curl https://app.example.com/api/health
   ```
6. Configure Cloudflare Access on the app hostname.

## 3. Import the data

### Path A: Netscape import (simplest)

1. In cloudpin, go to **Settings → Import & export**.
2. Upload the `bookmarks.html` file from the Linkding export.
3. Review the import counts (`created`, `updated`, `failed`).
4. Spot-check that key bookmarks, tags, and dates were preserved.

### Path B: Direct migration tool (richer)

1. Pull the Linkding SQLite file (or use a Postgres URL).
2. Run the migration tool in dry-run mode first:
   ```bash
   pnpm tsx tools/migrate-linkding.ts \
     --sqlite /path/to/db.sqlite3 \
     --default-user-email you@example.com \
     --dry-run
   ```
3. Produce a JSON export:
   ```bash
   pnpm tsx tools/migrate-linkding.ts \
     --sqlite /path/to/db.sqlite3 \
     --default-user-email you@example.com \
     --out migration.json --json
   ```
4. The JSON export can be fed into a future structured import route, or you
   can run a second pass that pushes the data into the cloudpin D1 directly
   via Wrangler.

## 4. Verify

- [ ] Total bookmark count matches the source within ±1 (rounding errors
      around timestamp parsing).
- [ ] Spot-check at least 5 bookmarks: title, description, notes, tags, dates.
- [ ] `bookmarks/check?url=…` returns the expected entries.
- [ ] Search the new instance for several representative queries.
- [ ] Tag cloud matches the source's most-used tags.
- [ ] Bundles are present (Path B only).

## 5. Cut over

1. Set the old Linkding instance to read-only if you want a soft cutover
   (e.g., set `LD_DISABLE_REGISTRATION=1` and disable all writes via a
   middleware).
2. Update DNS or reverse proxy rules so all traffic goes to cloudpin.
3. Monitor Workers Logs for the first 24 hours for errors and authentication
   failures.
4. If the old instance is no longer needed, snapshot the SQLite file and
   archive it.

## 6. Cleanup

- [ ] Old Linkding access keys revoked.
- [ ] Old instance database backed up offline.
- [ ] Cloudflare Access policy reviewed.
- [ ] R2 lifecycle rules set on the `imports/` and `exports/` prefixes
      so generated files do not accumulate.

## Rollback

- The Worker is versioned in Cloudflare; you can roll back the Worker code
  with `wrangler rollback`.
- D1 supports Time Travel for short-term point-in-time recovery.
- R2 objects are append-only for assets; restoring a deleted asset is not
  possible from R2 alone — keep a local backup of the old data.
