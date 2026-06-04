variable "account_id" {
  type        = string
  description = "Cloudflare account ID."
}

variable "environment" {
  type        = string
  description = "Deployment environment: preview or production."

  validation {
    condition     = contains(["preview", "production"], var.environment)
    error_message = "environment must be preview or production."
  }
}

variable "access_team_domain" {
  type        = string
  description = "Zero Trust team domain (e.g. myteam.cloudflareaccess.com). Written to wrangler vars; not created by Terraform."
  default     = ""
}

variable "access_aud" {
  type        = string
  description = "Access application AUD tag. Required when enable_access is false; ignored when Terraform manages Access."
  default     = ""
}

variable "admin_emails" {
  type        = string
  description = "Comma-separated admin emails for is_admin and optional Access allow policy."
  default     = ""
}

variable "public_base_url" {
  type        = string
  description = "Canonical app URL (https://app.example.com)."
}

variable "public_hostname" {
  type        = string
  description = "Hostname for public shared assets only; empty string disables split-host routing."
  default     = ""
}

variable "favicon_provider" {
  type        = string
  description = "Favicon fetch URL template with {url} placeholder."
  default     = "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={url}&size=32"
}

variable "enable_access" {
  type        = bool
  description = "Create a self-hosted Cloudflare Access application and allow policy for admin_emails."
  default     = false
}

variable "app_hostname" {
  type        = string
  description = "FQDN for the private Access app (e.g. app.example.com). Required when enable_access is true."
  default     = ""
}

variable "zone_id" {
  type        = string
  description = "Optional zone ID for DNS records."
  default     = ""
}

variable "app_dns_name" {
  type        = string
  description = "DNS record name for the app (relative to zone), e.g. app. Ignored when zone_id is empty."
  default     = "app"
}

variable "share_dns_name" {
  type        = string
  description = "DNS record name for the public share host, e.g. share. Ignored when zone_id or public_hostname is empty."
  default     = "share"
}

variable "worker_cname_target" {
  type        = string
  description = "CNAME target for app/share DNS (e.g. cloudpin.<account>.workers.dev). Set after first wrangler deploy."
  default     = ""
}

