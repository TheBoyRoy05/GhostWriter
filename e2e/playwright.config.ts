import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { API_PORT, WEB_PORT } from "./ports";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  outputDir: join(tmpdir(), "ghostwriter-e2e-results"),
  // One shared server: tests that write /api/job would overwrite each other's posting mid-assertion.
  workers: 1,
  reporter: "list",
  use: { baseURL: WEB_URL, browserName: "chromium", locale: "en-US", trace: "retain-on-failure" },
  // Run screens alone (`bun run e2e:shots`) so its shots show only the applications it seeds.
  projects: [
    { name: "screens", testMatch: "screens.e2e.ts" },
    { name: "desktop", testIgnore: "screens.e2e.ts", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: "bun e2e/serve-api.ts",
      cwd: REPO,
      env: { PORT: String(API_PORT) },
      url: `http://127.0.0.1:${API_PORT}/api/profile`,
      reuseExistingServer: false,
      // The default SIGKILL would skip serve-api's cleanup and leave its temp copy behind.
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: "bunx vite --config e2e/vite.config.ts",
      cwd: REPO,
      url: WEB_URL,
      reuseExistingServer: false,
    },
  ],
});
