import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-test",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8790", headless: true },
  webServer: {
    command: "npx wrangler dev --local --ip 127.0.0.1 --port 8790 --persist-to .wrangler/browser-test",
    url: "http://127.0.0.1:8790", reuseExistingServer: false, timeout: 60_000,
  },
});
