import express from "express";
import { sessionMiddleware } from "./middleware/session";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(express.json());
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);
