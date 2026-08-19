import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// The test suite logs in far more often, from the same "IP", than any real
// user would within these windows — rate limiting is a production concern,
// not something integration tests should have to dodge.
const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();
const isTest = env.NODE_ENV === "test";

// Brute-force/credential-stuffing protection: a handful of attempts per IP
// per window is generous for a real user (typos happen) but shuts down
// automated guessing long before it gets anywhere.
export const loginRateLimit = isTest
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Demasiados intentos. Inténtalo de nuevo en unos minutos." },
    });

// Registration doesn't guard an existing secret, but with no limit it can
// flood the admin approval queue or spam the DB — cap it more loosely.
export const registerRateLimit = isTest
  ? passthrough
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Demasiados registros desde esta dirección. Inténtalo más tarde." },
    });
