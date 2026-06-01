import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for cloudpin end-to-end tests.
 *
 * The webServer boots a local `wrangler dev` instance against a fresh local
 * D1, with the CLOUDPIN_E2E_BYPASS_AUTH env var set so the dev user is
 * authenticated by default. Local D1 is persisted to .wrangler/state/ so
 * re-runs build on the previous state; for an isolated run, delete
 * .wrangler/state/ first.
 *
 * The smoke spec at test/e2e/smoke.spec.ts is the canonical readiness
 * check: it boots the server, hits /bookmarks, asserts 200, and exits.
 * Every other spec extends this baseline.
 */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8788',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command:
      'npm run db:migrate:local && wrangler dev --port 8788 --ip 127.0.0.1 --persist-to .wrangler/state',
    url: 'http://127.0.0.1:8788/bookmarks',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      CLOUDPIN_E2E_BYPASS_AUTH: '1'
    },
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
