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
  getFormation,
  putFormation,
  upsertPlayerStat,
  getMatchStats,
  logMatchEvent,
  listMatchEvents,
  deleteMatchEvent,
  getTopPlayers,
  putTopPlayers,
} from "./matches.controller";

export const matchesRouter = Router();

matchesRouter.use(requireAuth);

matchesRouter.get("/", asyncHandler(listMatches));
matchesRouter.get("/:id", asyncHandler(getMatch));
matchesRouter.get("/:id/stats", asyncHandler(getMatchStats));
matchesRouter.get("/:id/events", asyncHandler(listMatchEvents));
matchesRouter.get("/:id/formation", asyncHandler(getFormation));
matchesRouter.post("/", requireRole("coach", "admin"), asyncHandler(createMatch));
matchesRouter.patch("/:id", requireRole("coach", "admin"), asyncHandler(updateMatch));
// Deleting a match and correcting its recorded stats are admin-only —
// coach keeps day-to-day match management (create/edit/squad/live
// tracking) but not the power to erase a match or overwrite its numbers
// after the fact.
matchesRouter.delete("/:id", requireRole("admin"), asyncHandler(deleteMatch));
matchesRouter.put("/:id/squad", requireRole("coach", "admin"), asyncHandler(putSquad));
matchesRouter.put("/:id/formation", requireRole("coach", "admin"), asyncHandler(putFormation));
matchesRouter.put("/:id/player-stats/:playerId", requireRole("admin"), asyncHandler(upsertPlayerStat));
matchesRouter.post("/:id/events", requireRole("coach", "admin"), asyncHandler(logMatchEvent));
// Coach can only undo during the live match (checked in the handler);
// cleaning up the history afterwards is an admin correction.
matchesRouter.delete("/:id/events/:eventId", requireRole("coach", "admin"), asyncHandler(deleteMatchEvent));
// The top 3 only feeds the rating and stays hidden from everyone else.
matchesRouter.get("/:id/top-players", requireRole("admin"), asyncHandler(getTopPlayers));
matchesRouter.put("/:id/top-players", requireRole("admin"), asyncHandler(putTopPlayers));
