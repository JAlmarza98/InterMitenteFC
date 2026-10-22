import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { getStandings } from "./league.service";

export const leagueRouter = Router();

leagueRouter.use(requireAuth);

leagueRouter.get(
  "/standings",
  asyncHandler(async (_req, res) => {
    res.json(await getStandings());
  })
);
