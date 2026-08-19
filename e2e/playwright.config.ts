import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: path.resolve(__dirname, "../backend/.env.test"), quiet: true });

const BACKEND_PORT = process.env.PORT ?? "3941";
const FRONTEND_PORT = "4310";
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "report.json" }],
  ],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        NODE_ENV: "test",
        PORT: BACKEND_PORT,
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        SESSION_SECRET: process.env.SESSION_SECRET ?? "",
        ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "",
        ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "",
      },
    },
    {
      command: `npm start -- --port ${FRONTEND_PORT}`,
      cwd: "../frontend",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        API_PROXY_TARGET: BACKEND_URL,
      },
    },
  ],
});
