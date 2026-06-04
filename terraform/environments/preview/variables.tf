variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. Prefer CLOUDFLARE_API_TOKEN env (TF_VAR_cloudflare_api_token)."
  sensitive   = true
  default     = null
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID."
}

variable "access_team_domain" {
  type    = string
  default = ""
}

variable "access_aud" {
  type        = string
  description = "Access AUD when enable_access is false."
  default     = ""
}

variable "admin_emails" {
  type    = string
  default = ""
}

variable "public_base_url" {
  type = string
}

variable "public_hostname" {
  type    = string
  default = ""
}

variable "favicon_provider" {
  type    = string
  default = "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={url}&size=32"
}

variable "enable_access" {
  type    = bool
  default = false
}

variable "app_hostname" {
  type    = string
  default = ""
}

variable "zone_id" {
  type    = string
  default = ""
}

variable "app_dns_name" {
  type    = string
  default = "app"
}

variable "share_dns_name" {
  type    = string
  default = "share"
}

variable "worker_cname_target" {
  type    = string
  default = ""
}

