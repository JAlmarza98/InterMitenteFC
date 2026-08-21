import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import * as controller from "./matchClock.controller";

export const matchClockRouter = Router({ mergeParams: true });

matchClockRouter.use(requireAuth);

// Reads are open to any authenticated member, same as the rest of the
// API — the live-match screen now has a read-only view for members
// (score, clock, who's on the pitch and for how long). Only the actions
// that change match state stay coach/admin.
matchClockRouter.get("/clock", asyncHandler(controller.getClock));
matchClockRouter.get("/segments", asyncHandler(controller.listSegments));

matchClockRouter.use(requireRole("coach", "admin"));

matchClockRouter.post("/clock/start-period", asyncHandler(controller.startPeriod));
matchClockRouter.post("/clock/pause", asyncHandler(controller.pause));
matchClockRouter.post("/clock/resume", asyncHandler(controller.resume));
matchClockRouter.post("/clock/end-period", asyncHandler(controller.endPeriod));
matchClockRouter.post("/clock/finish", asyncHandler(controller.finish));
matchClockRouter.post("/substitutions", asyncHandler(controller.substitute));
matchClockRouter.post("/segments", asyncHandler(controller.createSegment));
matchClockRouter.patch("/segments/:segmentId", asyncHandler(controller.updateSegment));
matchClockRouter.delete("/segments/:segmentId", asyncHandler(controller.deleteSegment));
