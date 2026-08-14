import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { loginRateLimit, registerRateLimit } from "../../middleware/rateLimit";
import { register, login, logout, me } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", registerRateLimit, asyncHandler(register));
authRouter.post("/login", loginRateLimit, asyncHandler(login));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", asyncHandler(me));
