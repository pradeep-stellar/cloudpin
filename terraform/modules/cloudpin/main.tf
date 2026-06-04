resource "cloudflare_d1_database" "main" {
  account_id = var.account_id
  name       = local.d1_database_name
}

resource "cloudflare_r2_bucket" "assets" {
  account_id = var.account_id
  name       = local.r2_bucket_name
}

resource "cloudflare_queue" "jobs_dlq" {
  account_id = var.account_id
  name       = local.dlq_queue_name
}

resource "cloudflare_queue" "jobs" {
  account_id = var.account_id
  name       = local.jobs_queue_name
}

resource "cloudflare_dns_record" "app" {
  count = var.zone_id != "" && var.worker_cname_target != "" ? 1 : 0

  zone_id = var.zone_id
  name    = var.app_dns_name
  content = var.worker_cname_target
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "share" {
  count = var.zone_id != "" && var.worker_cname_target != "" && var.public_hostname != "" ? 1 : 0

  zone_id = var.zone_id
  name    = var.share_dns_name
  content = var.worker_cname_target
  type    = "CNAME"
  proxied = true
  ttl     = 1
}