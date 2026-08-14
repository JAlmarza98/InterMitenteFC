import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { env } from "../config/env";

const pgPool = new Pool({ connectionString: env.DATABASE_URL });
const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({ pool: pgPool, createTableIfMissing: true }),
  secret: env.SESSION_SECRET,
  // Default express-session cookie name ("connect.sid") gives away the
  // backend stack for free; not a real vulnerability on its own, but no
  // reason to hand out fingerprinting hints either.
  name: "im.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    // 'auto': only marks the cookie Secure when the request is actually
    // HTTPS (directly or via the trusted X-Forwarded-Proto set in app.ts).
    // A hardcoded `true` here made the browser silently drop the cookie
    // whenever the app was reached over plain HTTP, breaking login.
    secure: "auto",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}
