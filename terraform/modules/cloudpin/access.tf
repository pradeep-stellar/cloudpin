resource "cloudflare_zero_trust_access_application" "app" {
  count = var.enable_access ? 1 : 0

  account_id = var.account_id
  name       = "cloudpin-${var.environment}"
  domain     = var.app_hostname
  type       = "self_hosted"

  session_duration          = "24h"
  auto_redirect_to_identity = false
}

resource "cloudflare_zero_trust_access_policy" "admins" {
  count = var.enable_access && length(local.admin_email_list) > 0 ? 1 : 0

  account_id     = var.account_id
  application_id = cloudflare_zero_trust_access_application.app[0].id
  name           = "cloudpin-${var.environment}-admins"
  precedence     = 1
  decision       = "allow"

  include {
    email = local.admin_email_list
  }
}