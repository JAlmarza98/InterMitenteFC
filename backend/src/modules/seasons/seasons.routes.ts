import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import { listSeasons, createSeason, updateSeason } from "./seasons.controller";

export const seasonsRouter = Router();

seasonsRouter.use(requireAuth);

seasonsRouter.get("/", asyncHandler(listSeasons));
seasonsRouter.post("/", requireRole("admin"), asyncHandler(createSeason));
seasonsRouter.patch("/:id", requireRole("admin"), asyncHandler(updateSeason));
