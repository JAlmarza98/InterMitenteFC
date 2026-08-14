import rateLimit from "express-rate-limit";

// Brute-force/credential-stuffing protection: a handful of attempts per IP
// per window is generous for a real user (typos happen) but shuts down
// automated guessing long before it gets anywhere.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Inténtalo de nuevo en unos minutos." },
});

// Registration doesn't guard an existing secret, but with no limit it can
// flood the admin approval queue or spam the DB — cap it more loosely.
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados registros desde esta dirección. Inténtalo más tarde." },
});
