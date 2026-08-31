import { defineConfig, devices } from "@playwright/test";

// E2E web-demo port. Override with E2E_WEB_DEMO_PORT to reuse an already
// running dev server (pnpm dev on 28080) - reuseExistingServer then skips
// the production build entirely and the browser origin matches the dev
// CORS/origin setup the gateway already trusts.
const e2ePort = process.env.E2E_WEB_DEMO_PORT ?? "9192";
// The gateway's WS origin check is host-strict: match the origin the dev
// server was validated against (127.0.0.1, not localhost).
const e2eHost = process.env.E2E_WEB_DEMO_HOST ?? "localhost";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,

  use: {
    baseURL: `http://${e2eHost}:${e2ePort}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: `http://${e2eHost}:${e2ePort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SKIP_ENV_VALIDATION: "1",
      KWORKS_AUTH_DISABLED: "1",
      // server.js 只识别 WEB_DEMO_PORT（PORT 会被忽略并回落到 28080）
      WEB_DEMO_PORT: e2ePort,
    },
  },
});
