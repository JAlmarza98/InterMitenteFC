import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { sessionMiddleware } from "./middleware/session";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { playersRouter } from "./modules/players/players.routes";
import { seasonsRouter } from "./modules/seasons/seasons.routes";
import { matchesRouter } from "./modules/matches/matches.routes";

export const app = express();

if (env.NODE_ENV === "development") {
  app.use(cors({ origin: "http://localhost:4200", credentials: true }));
}

app.use(express.json());
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/admin/users", usersRouter);
app.use("/api/players", playersRouter);
app.use("/api/seasons", seasonsRouter);
app.use("/api/matches", matchesRouter);

app.use(errorHandler);
