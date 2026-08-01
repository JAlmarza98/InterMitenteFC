import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { getSeasonStats } from "./stats.controller";

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get("/season/:seasonId", asyncHandler(getSeasonStats));
