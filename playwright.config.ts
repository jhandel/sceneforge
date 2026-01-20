import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "packages/playwright/tests",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
});
