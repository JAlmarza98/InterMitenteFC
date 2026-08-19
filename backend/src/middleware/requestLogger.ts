import pinoHttp from "pino-http";
import { logger } from "../config/logger";

export const requestLogger = pinoHttp({
  logger,
  // The session cookie and its value are the whole ballgame for account
  // takeover — never let them reach the logs, structured or not.
  redact: {
    paths: ["req.headers.cookie", 'res.headers["set-cookie"]'],
    remove: true,
  },
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
});
