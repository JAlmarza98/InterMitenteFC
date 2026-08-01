import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import { listUsers, approveUser, rejectUser, updateUserRole } from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("admin"));

usersRouter.get("/", asyncHandler(listUsers));
usersRouter.patch("/:id/approve", asyncHandler(approveUser));
usersRouter.patch("/:id/reject", asyncHandler(rejectUser));
usersRouter.patch("/:id/role", asyncHandler(updateUserRole));
