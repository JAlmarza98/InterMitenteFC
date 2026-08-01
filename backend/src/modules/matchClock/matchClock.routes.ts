import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";
import * as controller from "./matchClock.controller";

export const matchClockRouter = Router({ mergeParams: true });

matchClockRouter.use(requireAuth);

matchClockRouter.get("/clock", asyncHandler(controller.getClock));
matchClockRouter.get("/segments", asyncHandler(controller.listSegments));

const manage = requireRole("coach", "admin");

matchClockRouter.post("/clock/start-period", manage, asyncHandler(controller.startPeriod));
matchClockRouter.post("/clock/pause", manage, asyncHandler(controller.pause));
matchClockRouter.post("/clock/resume", manage, asyncHandler(controller.resume));
matchClockRouter.post("/clock/end-period", manage, asyncHandler(controller.endPeriod));
matchClockRouter.post("/clock/finish", manage, asyncHandler(controller.finish));
matchClockRouter.post("/substitutions", manage, asyncHandler(controller.substitute));
matchClockRouter.post("/segments", manage, asyncHandler(controller.createSegment));
matchClockRouter.patch("/segments/:segmentId", manage, asyncHandler(controller.updateSegment));
matchClockRouter.delete("/segments/:segmentId", manage, asyncHandler(controller.deleteSegment));
