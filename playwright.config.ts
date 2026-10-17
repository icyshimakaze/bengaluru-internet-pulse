import { defineConfig } from "@playwright/test";
import { DEMO_BASE_URL, LIVE_BASE_URL } from "./tests/e2e/urls";

const safeEnv = { ENRICHMENT_PROVIDER: "heuristic", OPENAI_API_KEY: "", XKIRO_API_KEY: "", CURRENTS_API_KEY: "", CURRENTS_ENABLED: "false",
  TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", CRON_SECRET: "" };

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: DEMO_BASE_URL, trace: "retain-on-failure" },
  webServer: [
    { command: "npm run start -- --hostname 127.0.0.1 --port 4317", url: DEMO_BASE_URL, reuseExistingServer: false, env: { ...safeEnv, APP_DATA_MODE: "demo" } },
    { command: "npm run start -- --hostname 127.0.0.1 --port 4318", url: LIVE_BASE_URL, reuseExistingServer: false, env: { ...safeEnv, APP_DATA_MODE: "live" } },
  ],
});
