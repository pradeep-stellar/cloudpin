#!/usr/bin/env bash
# cloudpin bootstrap — provision remote Cloudflare resources for an environment.
#
# Default: Terraform (terraform/environments/<env>) + sync wrangler.jsonc.
# Fallback: Wrangler CLI only with --wrangler-only.
#
# Usage:
#   tools/bootstrap.sh                    # production (Terraform)
#   tools/bootstrap.sh preview
#   tools/bootstrap.sh production
#   tools/bootstrap.sh --wrangler-only production
#   tools/bootstrap.sh --all              # preview + production (Terraform)
#   tools/bootstrap.sh --wrangler-only --all
#
# Environment:
#   CLOUDFLARE_API_TOKEN
#   CLOUDFLARE_ACCOUNT_ID

set -euo pipefail

USE_TERRAFORM=1
ENV="production"
ENVS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --wrangler-only)
      USE_TERRAFORM=0
      shift
      ;;
    --all)
      ENVS=(preview production)
      shift
      ;;
    -h | --help)
      sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    local | preview | production)
      ENV="$1"
      shift
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

if [ "${#ENVS[@]}" -eq 0 ]; then
  ENVS=("$ENV")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUDFLARE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$CLOUDFLARE_DIR"

WRANGLER=(npx --no-install wrangler)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed" >&2
    exit 1
  fi
}

check_credentials() {
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "warning: CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID are not set" >&2
  fi
}

# --- Wrangler-only path (legacy) -------------------------------------------

short_suffix() {
  case "$1" in
    production) printf 'prod' ;;
    *) printf '%s' "$1" ;;
  esac
}

d1_name() { printf 'cloudpin-%s' "$(short_suffix "$1")"; }
r2_name() { printf 'cloudpin-assets-%s' "$(short_suffix "$1")"; }
queue_name() { printf 'cloudpin-jobs-%s' "$(short_suffix "$1")"; }
dlq_name() { printf 'cloudpin-jobs-dlq-%s' "$(short_suffix "$1")"; }

find_d1_id() {
  local name="$1"
  "${WRANGLER[@]}" d1 list --json 2>/dev/null \
    | jq -r --arg n "$name" '.[] | select(.name == $n) | .uuid' \
    | head -n1
}

ensure_d1() {
  local name="$1"
  local id
  id="$(find_d1_id "$name")"
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    printf '  exists   %-32s %s\n' "$name" "$id" >&2
    printf '%s\n' "$id"
    return 0
  fi
  printf '  create   %s\n' "$name" >&2
  local output
  if ! output="$("${WRANGLER[@]}" d1 create "$name" 2>&1)"; then
    if echo "$output" | grep -qi "already exists"; then
      id="$(find_d1_id "$name")"
      if [ -n "$id" ] && [ "$id" != "null" ]; then
        printf '  exists   %-32s %s\n' "$name" "$id" >&2
        printf '%s\n' "$id"
        return 0
      fi
    fi
    printf 'error: failed to create D1 database %s:\n%s\n' "$name" "$output" >&2
    return 1
  fi
  id="$(printf '%s' "$output" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1)"
  if [ -z "$id" ]; then
    printf 'error: created D1 %s but could not parse UUID\n' "$name" >&2
    return 1
  fi
  printf '%s\n' "$id"
}

r2_exists() {
  local name="$1"
  "${WRANGLER[@]}" r2 bucket list 2>/dev/null \
    | awk -v n="$name" '$1 == "name:" && $2 == n { found = 1 } END { exit !found }'
}

ensure_r2() {
  local name="$1"
  if r2_exists "$name"; then
    printf '  exists   %s\n' "$name" >&2
    return 0
  fi
  printf '  create   %s\n' "$name" >&2
  "${WRANGLER[@]}" r2 bucket create "$name" >/dev/null
}

queue_exists() {
  local name="$1"
  "${WRANGLER[@]}" queues list 2>/dev/null \
    | awk -v n="$name" '$1 == "│" && $4 == n { found = 1 } END { exit !found }'
}

ensure_queue() {
  local name="$1"
  if queue_exists "$name"; then
    printf '  exists   %s\n' "$name" >&2
    return 0
  fi
  printf '  create   %s\n' "$name" >&2
  "${WRANGLER[@]}" queues create "$name" >/dev/null
}

bootstrap_wrangler_env() {
  local env="$1"
  require_command jq
  check_credentials
  printf '\n== %s (wrangler-only) ==\n' "$env"
  ensure_d1 "$(d1_name "$env")" >/dev/null
  ensure_r2 "$(r2_name "$env")"
  ensure_queue "$(queue_name "$env")"
  ensure_queue "$(dlq_name "$env")"
  printf '\nPaste the D1 database_id into wrangler.jsonc env.%s manually, or use Terraform.\n' "$env"
}

# --- Terraform path (default) ----------------------------------------------

bootstrap_terraform_env() {
  local env="$1"
  check_credentials
  "$SCRIPT_DIR/terraform-apply.sh" "$env" -auto-approve
}

print_next_steps() {
  cat <<'EOF'

== Next steps ==

1. wrangler types (if wrangler.jsonc changed)
2. Set secrets (not in Terraform state by default):

     npx wrangler secret put APP_SECRET --env production
     npx wrangler secret put API_TOKEN_PEPPER --env production

3. Deploy:

     npm run build
     npx wrangler d1 migrations apply DB --remote --env production
     npx wrangler deploy --env production

See ../terraform/README.md and ../DEPLOYMENT.md for Access, DNS, and CI.
EOF
}

main() {
  for env in "${ENVS[@]}"; do
    if [ "$env" = "local" ]; then
      if [ "$USE_TERRAFORM" -eq 1 ]; then
        echo "note: local uses Miniflare; skipping Terraform for local" >&2
      fi
      bootstrap_wrangler_env local
      continue
    fi
    if [ "$USE_TERRAFORM" -eq 1 ]; then
      bootstrap_terraform_env "$env"
    else
      bootstrap_wrangler_env "$env"
    fi
  done
  print_next_steps
}

main