terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

module "cloudpin" {
  source = "../../modules/cloudpin"

  account_id          = var.cloudflare_account_id
  environment         = "preview"
  access_team_domain  = var.access_team_domain
  access_aud          = var.access_aud
  admin_emails        = var.admin_emails
  public_base_url     = var.public_base_url
  public_hostname     = var.public_hostname
  favicon_provider    = var.favicon_provider
  enable_access       = var.enable_access
  app_hostname        = var.app_hostname
  zone_id             = var.zone_id
  app_dns_name        = var.app_dns_name
  share_dns_name      = var.share_dns_name
  worker_cname_target = var.worker_cname_target
}