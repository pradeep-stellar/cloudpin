#!/usr/bin/env bash
# Sync Terraform outputs into cloudflare/wrangler.jsonc for one environment.
#
# Usage:
#   tools/sync-wrangler-from-terraform.sh production
#   tools/sync-wrangler-from-terraform.sh preview
#
# Requires: terraform apply already run in terraform/environments/<env>
#           jq

set -euo pipefail

ENV="${1:-}"
if [ -z "$ENV" ] || [ "$ENV" = "-h" ] || [ "$ENV" = "--help" ]; then
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
fi

case "$ENV" in
  preview | production) ;;
  *)
    echo "error: environment must be preview or production (got: $ENV)" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUDFLARE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$CLOUDFLARE_DIR/.." && pwd)"
TF_DIR="$REPO_ROOT/terraform/environments/$ENV"
WRANGLER_JSONC="$CLOUDFLARE_DIR/wrangler.jsonc"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed" >&2
    exit 1
  fi
}

require_command terraform
require_command jq

if [ ! -d "$TF_DIR" ]; then
  echo "error: terraform directory not found: $TF_DIR" >&2
  exit 1
fi

if [ ! -f "$WRANGLER_JSONC" ]; then
  echo "error: wrangler.jsonc not found: $WRANGLER_JSONC" >&2
  exit 1
fi

D1_ID="$(terraform -chdir="$TF_DIR" output -raw d1_database_id)"
WRANGLER_ENV="$(terraform -chdir="$TF_DIR" output -raw wrangler_env_key)"
VARS_JSON="$(terraform -chdir="$TF_DIR" output -json wrangler_vars)"

TMP="$(mktemp)"
jq \
  --arg env "$WRANGLER_ENV" \
  --arg d1 "$D1_ID" \
  --argjson vars "$VARS_JSON" \
  '
    .env[$env].d1_databases[0].database_id = $d1
    | .env[$env].vars.ACCESS_TEAM_DOMAIN = $vars.ACCESS_TEAM_DOMAIN
    | .env[$env].vars.ACCESS_AUD = $vars.ACCESS_AUD
    | .env[$env].vars.ADMIN_EMAILS = $vars.ADMIN_EMAILS
    | .env[$env].vars.PUBLIC_BASE_URL = $vars.PUBLIC_BASE_URL
    | .env[$env].vars.PUBLIC_HOSTNAME = $vars.PUBLIC_HOSTNAME
  ' "$WRANGLER_JSONC" >"$TMP"

# Favicon provider lives at top-level vars in wrangler.jsonc; sync when set in tf output.
FAVICON="$(printf '%s' "$VARS_JSON" | jq -r '.FAVICON_PROVIDER // empty')"
if [ -n "$FAVICON" ]; then
  jq --arg fav "$FAVICON" '.vars.FAVICON_PROVIDER = $fav' "$TMP" >"${TMP}.2"
  mv "${TMP}.2" "$TMP"
fi

mv "$TMP" "$WRANGLER_JSONC"

printf 'updated %s for env.%s (database_id=%s)\n' "$WRANGLER_JSONC" "$WRANGLER_ENV" "$D1_ID"
printf 'next: cd cloudflare && npx wrangler types\n'