import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { sessionMiddleware } from "./middleware/session";
import { errorHandler, asyncHandler } from "./middleware/errorHandler";
import { apiRateLimit } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import { healthCheck } from "./modules/health/health.controller";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { playersRouter } from "./modules/players/players.routes";
import { seasonsRouter } from "./modules/seasons/seasons.routes";
import { matchesRouter } from "./modules/matches/matches.routes";
import { matchClockRouter } from "./modules/matchClock/matchClock.routes";
import { statsRouter } from "./modules/stats/stats.routes";
import { liveUpdatesRouter } from "./modules/liveUpdates/liveUpdates.routes";

export const app = express();

// Pure JSON API (the frontend is served separately, by nginx in prod / ng
// serve in dev) — CSP's script/style-src directives don't apply here, and
// defaults would only add noise, so this is deliberately Helmet's baseline
// (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) with no custom CSP.
app.use(helmet());

if (env.NODE_ENV === "production") {
  // Trust the reverse proxy (our nginx web container, itself behind the
  // user's own TLS-terminating proxy) so req.secure reflects the original
  // client protocol via X-Forwarded-Proto. Required for secure session cookies.
  app.set("trust proxy", 1);
}

if (env.NODE_ENV === "development") {
  app.use(cors({ origin: "http://localhost:4200", credentials: true }));
}

app.use(express.json());
app.use(sessionMiddleware);
app.use(apiRateLimit);
app.use(requestLogger);

app.get("/api/health", asyncHandler(healthCheck));

app.use("/api/auth", authRouter);
app.use("/api/admin/users", usersRouter);
app.use("/api/players", playersRouter);
app.use("/api/seasons", seasonsRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/matches/:matchId", matchClockRouter);
app.use("/api/stats", statsRouter);
app.use("/api/live-updates", liveUpdatesRouter);

app.use(errorHandler);
