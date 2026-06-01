import type { AuthResolveResult } from '$lib/server/auth/middleware';

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        ASSETS_BUCKET: R2Bucket;
        JOBS: Queue;
        BROWSER?: Fetcher;
        ACCESS_TEAM_DOMAIN?: string;
        ACCESS_AUD?: string;
        ADMIN_EMAILS?: string;
        PUBLIC_BASE_URL?: string;
        FAVICON_PROVIDER?: string;
        APP_SECRET?: string;
        API_TOKEN_PEPPER?: string;
        [key: string]: unknown;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
        [key: string]: unknown;
      };
    }

    interface Locals {
      auth: AuthResolveResult;
    }
  }
}

export {};
