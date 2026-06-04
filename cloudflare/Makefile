# cloudpin — local development Makefile
#
# Run `make help` to see all available targets.
# All targets run from this directory (cloudflare/).

PORT          ?= 8787
WRANGLER      ?= npx --no-install wrangler
NPM           ?= npm
SHELL         := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help (default target)
	@printf '\033[1mcloudpin — local dev targets\033[0m\n\n'
	@awk 'BEGIN {FS = ":.*## "; printf "  \033[36m%-22s\033[0m %s\n", "TARGET", "DESCRIPTION"} \
		/^[a-zA-Z_][a-zA-Z0-9_-]*:.*## / \
		{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
		$(MAKEFILE_LIST)
	@printf "\nVariables: PORT (default $(PORT)).\n"
	@printf "Examples:\n"
	@printf "  make dev PORT=9000     # start dev server on a custom port\n"
	@printf "  make ci                 # run typecheck + lint + test + build\n"
	@printf "  make db-reset           # drop local D1 and re-apply migrations\n\n"

# ----- install & first-time setup ----------------------------------------

.PHONY: install
install: ## Install Node dependencies (npm ci if lockfile present, else npm install)
	@if [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

.PHONY: setup
setup: install typegen db-migrate ## First-time setup: install, generate types, apply local migrations

# ----- dev server --------------------------------------------------------

.PHONY: dev
dev: ## Run the dev server on http://localhost:8787 (override with PORT=9000)
	$(NPM) run dev -- --port $(PORT)

.PHONY: dev-remote
dev-remote: ## Run dev server with remote Cloudflare bindings on :8787 (needs CLOUDFLARE_API_TOKEN)
	$(WRANGLER) dev --remote --port $(PORT)

.PHONY: dev-remote-bg
dev-remote-bg: ## Run dev server in background with remote bindings (logs: .wrangler/dev.log, PID: .wrangler/dev.pid)
	@mkdir -p .wrangler
	@nohup $(WRANGLER) dev --remote --port $(PORT) \
		> .wrangler/dev.log 2>&1 & echo $$! > .wrangler/dev.pid
	@printf "started wrangler dev (pid %s) on http://localhost:$(PORT)\n" "$$(cat .wrangler/dev.pid)"
	@printf "tail logs with:  tail -f .wrangler/dev.log\n"
	@printf "stop with:       make dev-stop\n"

.PHONY: dev-stop
dev-stop: ## Stop the background dev server started by dev-remote-bg
	@if [ -f .wrangler/dev.pid ]; then \
		PID=$$(cat .wrangler/dev.pid); \
		kill $$PID 2>/dev/null || true; \
		rm -f .wrangler/dev.pid; \
		printf "stopped wrangler dev (pid %s)\n" "$$PID"; \
	else \
		printf "no .wrangler/dev.pid found — nothing to stop\n"; \
	fi

# ----- code quality ------------------------------------------------------

.PHONY: typegen
typegen: ## Generate Cloudflare Worker bindings (worker-configuration.d.ts)
	$(NPM) run cf:typegen

.PHONY: typecheck
typecheck: ## Run svelte-check (TypeScript + Svelte)
	$(NPM) run typecheck

.PHONY: lint
lint: ## Lint with prettier --check and eslint
	$(NPM) run lint

.PHONY: format
format: ## Format code with prettier (writes changes)
	$(NPM) run format

.PHONY: format-check
format-check: ## Check formatting without writing
	$(NPM) exec -- prettier --check .

.PHONY: ci
ci: typecheck lint test build ## Run the full CI pipeline locally (typecheck + lint + test + build)

# ----- tests -------------------------------------------------------------

.PHONY: test
test: ## Run unit tests (Vitest, single run)
	$(NPM) test

.PHONY: test-watch
test-watch: ## Run unit tests in watch mode
	$(NPM) run test:watch

.PHONY: test-e2e-install
test-e2e-install: ## Install Playwright Chromium + system deps (one-time)
	$(NPM) run test:e2e:install

.PHONY: test-e2e
test-e2e: ## Run Playwright e2e tests (auto-starts wrangler dev via playwright.config.ts)
	$(NPM) run test:e2e

.PHONY: test-all
test-all: test test-e2e ## Run unit + e2e tests

# ----- local D1 database -------------------------------------------------

.PHONY: db-migrate
db-migrate: ## Apply migrations to the local D1 database
	$(NPM) run db:migrate:local

.PHONY: db-reset
db-reset: ## Drop local D1 state and re-apply migrations
	@rm -rf .wrangler/state/v3/d1
	@printf "removed .wrangler/state/v3/d1\n"
	@$(MAKE) --no-print-directory db-migrate

.PHONY: db-tables
db-tables: ## List tables in the local D1 database
	$(NPM) exec -- wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

.PHONY: db-sql
db-sql: ## Run an arbitrary SQL statement against local D1 (use: make db-sql SQL="SELECT 1")
	@test -n "$${SQL:-}" || (printf "usage: make db-sql SQL=\"SELECT 1\"\n" >&2; exit 2)
	$(NPM) exec -- wrangler d1 execute DB --local --command "$$SQL"

.PHONY: db-shell
db-shell: ## Open an interactive sqlite3 shell on the local D1 database
	@DB_FILE=$$(find .wrangler/state -name '*.sqlite' 2>/dev/null | head -1); \
	if [ -z "$$DB_FILE" ]; then \
		printf "no local D1 file found — run 'make db-migrate' first\n" >&2; \
		exit 1; \
	fi; \
	printf "opening $$DB_FILE\n"; \
	sqlite3 "$$DB_FILE"

# ----- remote D1 database -----------------------------------------------

.PHONY: db-migrate-preview
db-migrate-preview: ## Apply migrations to remote D1 (preview env)
	$(NPM) run db:migrate:remote:preview

.PHONY: db-migrate-prod
db-migrate-prod: ## Apply migrations to remote D1 (production env)
	$(NPM) run db:migrate:remote:prod

# ----- build & deploy ----------------------------------------------------

.PHONY: build
build: ## Build the production Worker bundle (vite build + post-build patch)
	$(NPM) run build

.PHONY: preview
preview: ## Run wrangler dev (alias for dev; uses built bundle if present)
	$(NPM) run preview -- --port $(PORT)

.PHONY: deploy
deploy: build ## Build, then deploy to production (requires authenticated wrangler)
	$(NPM) run deploy

.PHONY: deploy-preview
deploy-preview: build ## Build, then deploy to the preview environment
	$(WRANGLER) deploy --env preview

.PHONY: tail
tail: ## Tail live logs from the production Worker
	$(WRANGLER) tail

# ----- Terraform / Cloudflare resource bootstrap ---------------------------

.PHONY: terraform-init-production
terraform-init-production: ## terraform init (production)
	terraform -chdir=../terraform/environments/production init

.PHONY: terraform-plan-production
terraform-plan-production: ## terraform plan (production)
	terraform -chdir=../terraform/environments/production plan

.PHONY: terraform-production
terraform-production: ## terraform apply + sync wrangler.jsonc (production)
	tools/terraform-apply.sh production

.PHONY: terraform-preview
terraform-preview: ## terraform apply + sync wrangler.jsonc (preview)
	tools/terraform-apply.sh preview

.PHONY: sync-wrangler-production
sync-wrangler-production: ## Patch wrangler.jsonc from Terraform outputs (production)
	tools/sync-wrangler-from-terraform.sh production

.PHONY: bootstrap
bootstrap: ## Provision remote resources via Terraform (default: production)
	tools/bootstrap.sh

.PHONY: bootstrap-preview
bootstrap-preview: ## Terraform bootstrap for preview
	tools/bootstrap.sh preview

.PHONY: bootstrap-wrangler
bootstrap-wrangler: ## Legacy Wrangler-only bootstrap (production)
	tools/bootstrap.sh --wrangler-only production

.PHONY: bootstrap-local
bootstrap-local: ## Wrangler-only local resource hints (Miniflare creates local state)
	tools/bootstrap.sh --wrangler-only local

.PHONY: bootstrap-all
bootstrap-all: ## Terraform bootstrap preview + production
	tools/bootstrap.sh --all

# ----- secrets -----------------------------------------------------------

.PHONY: secret-put
secret-put: ## Set a production secret interactively (use: make secret-put NAME=APP_SECRET)
	@test -n "$${NAME:-}" || (printf "usage: make secret-put NAME=APP_SECRET [ENV=production]\n" >&2; exit 2)
	$(WRANGLER) secret put $$NAME $${ENV:+--env $$ENV}

# ----- cleanup -----------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts (.svelte-kit/cloudflare, .svelte-kit/output)
	rm -rf .svelte-kit/cloudflare .svelte-kit/output
	@printf "removed .svelte-kit/cloudflare and .svelte-kit/output\n"

.PHONY: reset-state
reset-state: ## Remove all local Wrangler state (D1, R2, queues, KV)
	rm -rf .wrangler/state
	@printf "removed .wrangler/state\n"

.PHONY: clean-all
clean-all: clean reset-state ## Remove build artifacts and all local state
	@printf "done — run 'make setup' to start fresh\n"
