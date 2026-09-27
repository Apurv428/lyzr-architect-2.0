import { defineConfig, devices } from "@playwright/test";
import path from "path";

const PORT = 3130;
export const AUTH_FILE = path.join(__dirname, ".playwright/auth.json");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  outputDir: "test-results",
  projects: [
    // ── 1. Sign in once and save the session ──────────────────────────────────
    {
      name: "auth:setup",
      testMatch: "auth.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },

    // ── 2. Authenticated desktop tests ───────────────────────────────────────
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
      dependencies: ["auth:setup"],
      testIgnore: ["auth.setup.ts"],
    },

    // ── 3. Authenticated mobile tests ────────────────────────────────────────
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
      dependencies: ["auth:setup"],
      testIgnore: ["auth.setup.ts"],
    },

    // ── 4. Public (unauthenticated) tests — no auth dependency ───────────────
    {
      name: "public",
      testMatch: "public.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
