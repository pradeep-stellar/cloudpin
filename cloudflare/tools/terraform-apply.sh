#!/usr/bin/env bash
# Run terraform apply for preview or production, then sync wrangler.jsonc.
#
# Usage:
#   tools/terraform-apply.sh production
#   tools/terraform-apply.sh preview -auto-approve
#
# Environment:
#   CLOUDFLARE_API_TOKEN   used by the Cloudflare provider
#   CLOUDFLARE_ACCOUNT_ID  should match cloudflare_account_id in terraform.tfvars

set -euo pipefail

ENV="${1:-production}"
shift || true

case "$ENV" in
  preview | production) ;;
  -h | --help)
    sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "error: environment must be preview or production" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TF_DIR="$REPO_ROOT/terraform/environments/$ENV"

if ! command -v terraform >/dev/null 2>&1; then
  echo "error: terraform is not installed" >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "warning: CLOUDFLARE_API_TOKEN is not set" >&2
fi

if [ ! -f "$TF_DIR/terraform.tfvars" ]; then
  echo "error: missing $TF_DIR/terraform.tfvars (copy from terraform.tfvars.example)" >&2
  exit 1
fi

terraform -chdir="$TF_DIR" init -input=false
terraform -chdir="$TF_DIR" apply "$@"

"$SCRIPT_DIR/sync-wrangler-from-terraform.sh" "$ENV"