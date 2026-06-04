# cloudpin — Terraform

Provisions **remote** Cloudflare resources for cloudpin (D1, R2, queues, optional Access and DNS). Does **not** deploy Worker code — that stays **Wrangler** + GitHub Actions.

## Layout

```text
terraform/
  modules/cloudpin/          # Shared resources + outputs for wrangler.jsonc
  environments/
    preview/main.tf          # One stack per environment (separate state)
    production/main.tf
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) 1.5+
- Cloudflare API token with at least: **Account** → D1 Edit, R2 Edit, Queues Edit; add **Zero Trust** Edit if `enable_access = true`
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (or in `terraform.tfvars`)

## Quick start (production)

```bash
cd terraform/environments/production
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set account id, URLs, Access settings

export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...   # also used as cloudflare_account_id in tfvars

terraform init
terraform plan
terraform apply

# Patch cloudflare/wrangler.jsonc from Terraform outputs
../../cloudflare/tools/sync-wrangler-from-terraform.sh production
cd ../../cloudflare && npx wrangler types
```

Or from the app directory:

```bash
cd cloudflare
make terraform-production    # apply + sync wrangler
```

## What Terraform manages vs Wrangler

| Terraform | Wrangler / CI |
| --------- | ------------- |
| D1 database (resource + `database_id` output) | D1 migrations (`wrangler d1 migrations apply`) |
| R2 bucket, job queues + DLQ | Worker bundle, bindings in `wrangler.jsonc` |
| Optional Access app + admin policy | `APP_SECRET`, `API_TOKEN_PEPPER` (`wrangler secret put`) |
| Optional DNS CNAME to Worker | `wrangler deploy` |

**Do not** create the same D1/R2/queue twice with `bootstrap.sh` and Terraform — pick one path.

## Variables (per environment `terraform.tfvars`)

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `cloudflare_account_id` | yes | Account ID |
| `public_base_url` | yes | e.g. `https://app.example.com` |
| `access_team_domain` | for browser auth | Team domain, no scheme |
| `access_aud` | if `enable_access = false` | From Access dashboard |
| `admin_emails` | recommended | Comma-separated |
| `public_hostname` | optional | Share host for split routing |
| `enable_access` | optional | `true` creates Access app; AUD comes from Terraform |
| `app_hostname` | if `enable_access` | FQDN matching Access app |
| `zone_id` + `worker_cname_target` | optional | DNS after first deploy |

## Outputs

After `terraform apply`:

```bash
terraform output d1_database_id
terraform output -json wrangler_vars
```

`sync-wrangler-from-terraform.sh` writes `database_id` and `vars` into `cloudflare/wrangler.jsonc` for the selected environment.

## State

Default: **local** `terraform.tfstate` in each environment directory (gitignored). For teams, use a remote backend — see `environments/production/backend.tf.example`.

## Legacy bootstrap

`cloudflare/tools/bootstrap.sh` remains as a Wrangler-only fallback (`--wrangler-only`). Prefer Terraform for preview/production.