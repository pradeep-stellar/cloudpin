#!/usr/bin/env bash
# cloudpin bootstrap — idempotently create the Cloudflare resources
# that cloudpin needs and print the IDs to paste into wrangler.jsonc.
#
# Usage:
#   tools/bootstrap.sh                # bootstrap production (default)
#   tools/bootstrap.sh production     # same as above
#   tools/bootstrap.sh preview        # bootstrap preview
#   tools/bootstrap.sh local          # bootstrap local
#   tools/bootstrap.sh --all          # bootstrap all three
#
# Environment:
#   CLOUDFLARE_API_TOKEN   required for create commands
#   CLOUDFLARE_ACCOUNT_ID  required for create commands
#
# The script is idempotent: existing resources are detected and their
# IDs are printed instead of being recreated. The script never deletes
# anything, so it is safe to re-run.
#
# Output:
#   At the end, the script prints a paste-ready block per environment
#   that lists the database_id values to put in wrangler.jsonc. R2
#   buckets and queues do not need an ID in wrangler.jsonc; the name
#   is enough.

set -euo pipefail

ENV="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUDFLARE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use the cloudflare/ working directory so wrangler picks up the right
# wrangler.jsonc and .dev.vars.
cd "$CLOUDFLARE_DIR"

WRANGLER=(npx --no-install wrangler)

# require_command prints an error and exits if a binary is missing.
require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed" >&2
    exit 1
  fi
}

require_command node
require_command npx
if ! command -v jq >/dev/null 2>&1; then
  echo "error: required command 'jq' is not installed (brew install jq / apt install jq)" >&2
  exit 1
fi

# Resource name builders — mirror the names in wrangler.jsonc. The
# shorthand argument to the script is "production" / "preview" / "local"
# but the suffix in resource names is the abbreviated "prod".
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

# Look up an existing D1 database by name. Echoes the UUID or nothing.
find_d1_id() {
  local name="$1"
  "${WRANGLER[@]}" d1 list --json 2>/dev/null \
    | jq -r --arg n "$name" '.[] | select(.name == $n) | .uuid' \
    | head -n1
}

# ensure_d1 prints the ID on stdout (callers capture it) and
# informational lines on stderr (so they don't end up in the
# captured stdout and silently disappear from the user).
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
    # Race: another process created it between our list and create.
    # Try to look it up one more time.
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
  # The D1 create output includes a "database_id = ..." line; pull it
  # from either that or the bare UUID pattern.
  id="$(printf '%s' "$output" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1)"
  if [ -z "$id" ]; then
    printf 'error: created D1 %s but could not parse UUID from output:\n%s\n' "$name" "$output" >&2
    return 1
  fi
  printf '%s\n' "$id"
}

# Check if an R2 bucket exists by name.
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
  if ! "${WRANGLER[@]}" r2 bucket create "$name" >/dev/null 2>&1; then
    if r2_exists "$name"; then
      printf '  exists   %s\n' "$name" >&2
      return 0
    fi
    printf 'error: failed to create R2 bucket %s\n' "$name" >&2
    return 1
  fi
}

# Check if a queue exists by name. The wrangler queues list output is
# a table with the format
#   │ <id> │ <name padded to 30> │ ...
# so the name sits in field 4 (the cell between two │ glyphs). We
# look for the column-aligned name to avoid matching a name that
# happens to be a prefix of another (e.g. cloudpin-jobs-prod vs
# cloudpin-jobs-production).
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
  if ! "${WRANGLER[@]}" queues create "$name" >/dev/null 2>&1; then
    if queue_exists "$name"; then
      printf '  exists   %s\n' "$name" >&2
      return 0
    fi
    printf 'error: failed to create queue %s\n' "$name" >&2
    return 1
  fi
}

# Bootstrap a single environment. Echoes "<env>:<d1_id>" on the last
# line so callers can capture the ID programmatically.
bootstrap_env() {
  local env="$1"
  local d1 r2 q dlq d1_id

  d1="$(d1_name "$env")"
  r2="$(r2_name "$env")"
  q="$(queue_name "$env")"
  dlq="$(dlq_name "$env")"

  printf '\n== %s ==\n' "$env"
  printf -- '-- d1 --\n'
  d1_id="$(ensure_d1 "$d1")"

  printf -- '-- r2 --\n'
  ensure_r2 "$r2"

  printf -- '-- queues --\n'
  ensure_queue "$q"
  ensure_queue "$dlq"

  printf '%s:%s\n' "$env" "$d1_id"
}

# Check the access credentials that wrangler needs. Print a warning if
# they are not set; the script will still work for read-only lookups
# but will fail to create new resources.
check_credentials() {
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "warning: CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID are not set"
    echo "         existing resources can still be looked up, but creation will fail"
  fi
}

print_summary() {
  cat <<'EOF'

== wrangler.jsonc patch ==

The script created or located the production resources. The D1
database_id is the only field that must be set in wrangler.jsonc; the
R2 bucket and queue names are already correct. Replace the placeholder
production database_id with the ID printed above. The preview env
follows the same shape.

  "env": {
    "production": {
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "cloudpin-prod",
          "database_id": "<PASTE production d1 id here>",
          "migrations_dir": "migrations"
        }
      ],
      ...
    }
  }

== secrets ==

After the D1 / R2 / queue IDs are in place, set the production secrets
interactively (the values are not stored in the repo):

  npx wrangler secret put APP_SECRET         --env production
  npx wrangler secret put API_TOKEN_PEPPER   --env production
  npx wrangler secret put WAYBACK_ACCESS_KEY --env production  # optional

== access ==

The production Access application is created in the Cloudflare
dashboard (Access → Applications → Add an application → Self-hosted).
Set the audience tag and team domain in wrangler.jsonc env.production
vars:

  "ACCESS_TEAM_DOMAIN": "<your-team>.cloudflareaccess.com",
  "ACCESS_AUD":         "<audience tag from the Access app>",
  "ADMIN_EMAILS":       "owner@example.com"

== first deploy ==

After the above:

  npm run typecheck
  npm run lint
  npm test
  npm run build
  npx wrangler d1 migrations apply DB --remote --env production
  npx wrangler deploy --env production
EOF
}

main() {
  check_credentials
  case "$ENV" in
    --all)
      bootstrap_env local
      bootstrap_env preview
      bootstrap_env production
      ;;
    local | preview | production)
      bootstrap_env "$ENV"
      ;;
    -h | --help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "error: unknown environment '$ENV' (expected: local, preview, production, --all)" >&2
      exit 2
      ;;
  esac
  print_summary
}

main
