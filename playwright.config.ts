import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, env: { APP_DATA_MODE: "demo", AI_ENABLED: "false", TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", CRON_SECRET: "" } },
    { command: "npm run start -- --port 3001", url: "http://127.0.0.1:3001", reuseExistingServer: !process.env.CI, env: { APP_DATA_MODE: "live", AI_ENABLED: "false", TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", CRON_SECRET: "" } },
  ],
});
