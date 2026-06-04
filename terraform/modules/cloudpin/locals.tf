locals {
  name_suffix = var.environment == "production" ? "prod" : var.environment

  d1_database_name = "cloudpin-${local.name_suffix}"
  r2_bucket_name   = "cloudpin-assets-${local.name_suffix}"
  jobs_queue_name  = "cloudpin-jobs-${local.name_suffix}"
  dlq_queue_name   = "cloudpin-jobs-dlq-${local.name_suffix}"

  wrangler_env_key = var.environment
  worker_name      = var.environment == "production" ? "cloudpin" : "cloudpin-preview"

  admin_email_list = compact([
    for e in split(",", var.admin_emails) : trimspace(e) if trimspace(e) != ""
  ])

  access_aud = var.enable_access ? cloudflare_zero_trust_access_application.app[0].aud : var.access_aud
}