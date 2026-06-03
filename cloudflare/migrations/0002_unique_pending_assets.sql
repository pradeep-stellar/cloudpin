CREATE UNIQUE INDEX idx_assets_pending_bookmark_type
ON bookmark_assets(bookmark_id, asset_type)
WHERE status = 'pending';

--> statement-breakpoint
