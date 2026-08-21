import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { stream } from "./liveUpdates.controller";

export const liveUpdatesRouter = Router();

// One global stream, open to any authenticated member — same read-access
// policy as the match clock's own GET endpoints (see matchClock.routes.ts):
// every viewer should learn a match changed, not just coach/admin.
liveUpdatesRouter.get("/", requireAuth, asyncHandler(stream));
