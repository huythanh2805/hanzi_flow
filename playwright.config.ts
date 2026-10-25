import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname localhost --port 3100",
    env: { HANZIFLOW_LOCAL_TRIAL: "1", HANZIFLOW_E2E: "1" },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
