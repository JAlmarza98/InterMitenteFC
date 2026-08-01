import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import {
  listMatches,
  getMatch,
  createMatch,
  updateMatch,
  deleteMatch,
  putSquad,
} from "./matches.controller";

export const matchesRouter = Router();

matchesRouter.use(requireAuth);

matchesRouter.get("/", asyncHandler(listMatches));
matchesRouter.get("/:id", asyncHandler(getMatch));
matchesRouter.post("/", requireRole("coach", "admin"), asyncHandler(createMatch));
matchesRouter.patch("/:id", requireRole("coach", "admin"), asyncHandler(updateMatch));
matchesRouter.delete("/:id", requireRole("coach", "admin"), asyncHandler(deleteMatch));
matchesRouter.put("/:id/squad", requireRole("coach", "admin"), asyncHandler(putSquad));
