import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { loginRateLimit, registerRateLimit, passwordResetRateLimit } from "../../middleware/rateLimit";
import { requireAuth } from "../../middleware/requireAuth";
import {
  register,
  login,
  logout,
  me,
  requestPasswordResetHandler,
  resetPassword,
  changeOwnPassword,
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", registerRateLimit, asyncHandler(register));
authRouter.post("/login", loginRateLimit, asyncHandler(login));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", asyncHandler(me));
authRouter.post("/password-reset-request", passwordResetRateLimit, asyncHandler(requestPasswordResetHandler));
authRouter.post("/password-reset", passwordResetRateLimit, asyncHandler(resetPassword));
authRouter.post("/password", requireAuth, asyncHandler(changeOwnPassword));
