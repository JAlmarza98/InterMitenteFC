import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import * as controller from "./matchClock.controller";

export const matchClockRouter = Router({ mergeParams: true });

// Live-match tracking (the clock, playing-time segments, substitutions)
// is a coach/admin tool end to end, unlike the rest of the API where
// reads are open to everyone — a member has no screen that shows this
// data, so the reads are scoped the same as the writes instead of being
// reachable only by calling the API directly.
matchClockRouter.use(requireAuth, requireRole("coach", "admin"));

matchClockRouter.get("/clock", asyncHandler(controller.getClock));
matchClockRouter.get("/segments", asyncHandler(controller.listSegments));

matchClockRouter.post("/clock/start-period", asyncHandler(controller.startPeriod));
matchClockRouter.post("/clock/pause", asyncHandler(controller.pause));
matchClockRouter.post("/clock/resume", asyncHandler(controller.resume));
matchClockRouter.post("/clock/end-period", asyncHandler(controller.endPeriod));
matchClockRouter.post("/clock/finish", asyncHandler(controller.finish));
matchClockRouter.post("/substitutions", asyncHandler(controller.substitute));
matchClockRouter.post("/segments", asyncHandler(controller.createSegment));
matchClockRouter.patch("/segments/:segmentId", asyncHandler(controller.updateSegment));
matchClockRouter.delete("/segments/:segmentId", asyncHandler(controller.deleteSegment));
