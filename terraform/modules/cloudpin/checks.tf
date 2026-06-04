check "access_hostname_when_enabled" {
  assert {
    condition     = !var.enable_access || var.app_hostname != ""
    error_message = "app_hostname must be set when enable_access is true."
  }
}