import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { register, login, logout, me } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(register));
authRouter.post("/login", asyncHandler(login));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", asyncHandler(me));
