import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import { listPlayers, getPlayer, createPlayer, updatePlayer } from "./players.controller";

export const playersRouter = Router();

playersRouter.use(requireAuth);

playersRouter.get("/", asyncHandler(listPlayers));
playersRouter.get("/:id", asyncHandler(getPlayer));
playersRouter.post("/", requireRole("coach", "admin"), asyncHandler(createPlayer));
playersRouter.patch("/:id", requireRole("coach", "admin"), asyncHandler(updatePlayer));
