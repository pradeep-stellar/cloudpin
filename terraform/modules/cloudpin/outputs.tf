output "environment" {
  value = var.environment
}

output "worker_name" {
  description = "Wrangler worker name for this environment."
  value       = local.worker_name
}

output "wrangler_env_key" {
  description = "Key under wrangler.jsonc env (preview | production)."
  value       = local.wrangler_env_key
}

output "d1_database_id" {
  description = "Paste into wrangler.jsonc env.*.d1_databases[0].database_id (or run sync-wrangler script)."
  value       = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.main.name
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.assets.name
}

output "jobs_queue_name" {
  value = cloudflare_queue.jobs.name
}

output "dlq_queue_name" {
  value = cloudflare_queue.jobs_dlq.name
}

output "access_aud" {
  description = "Access application AUD for wrangler ACCESS_AUD var."
  value       = local.access_aud
}

output "wrangler_vars" {
  description = "Non-secret vars to sync into wrangler.jsonc for this environment."
  value = {
    ACCESS_TEAM_DOMAIN = var.access_team_domain
    ACCESS_AUD           = local.access_aud
    ADMIN_EMAILS         = var.admin_emails
    PUBLIC_BASE_URL      = var.public_base_url
    PUBLIC_HOSTNAME      = var.public_hostname
    FAVICON_PROVIDER     = var.favicon_provider
  }
}

output "access_application_id" {
  value       = var.enable_access ? cloudflare_zero_trust_access_application.app[0].id : null
  description = "Zero Trust Access application ID when enable_access is true."
}