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
        [key: string]: unknown;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      };
    }
  }
}

export {};
