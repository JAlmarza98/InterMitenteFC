import path from "node:path";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

/** Applies pending migrations and bootstraps the admin user (via the
 * backend's own seed.ts) against the test database, once, before the whole
 * E2E suite runs. Keeps the E2E DB self-sufficient — no manual setup step. */
export default async function globalSetup() {
  const backendDir = path.resolve(__dirname, "../backend");
  const { parsed } = dotenv.config({ path: path.join(backendDir, ".env.test"), quiet: true });
  const env = { ...process.env, ...parsed };

  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: backendDir, env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "src/scripts/resetTestDb.ts"], { cwd: backendDir, env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "src/scripts/seed.ts"], { cwd: backendDir, env, stdio: "inherit" });
}
