import path from "node:path";
import dotenv from "dotenv";

// Loaded independently from playwright.config.ts: each test file may run in
// its own worker process, which doesn't inherit the config file's in-memory
// env mutations, only whatever was in process.env when the worker forked.
dotenv.config({ path: path.resolve(__dirname, "../../backend/.env.test"), quiet: true });

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
export const ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD!;
