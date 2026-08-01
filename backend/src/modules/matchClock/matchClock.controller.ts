import { Request, Response } from "express";
import { z } from "zod";
import * as clockService from "./matchClock.service";

const periodTypeSchema = z.enum(["first_half", "second_half", "extra_first", "extra_second"]);

const startPeriodSchema = z.object({ type: periodTypeSchema });

const substitutionSchema = z.object({
  playerOutId: z.string().uuid(),
  playerInId: z.string().uuid(),
});

const manualSegmentSchema = z.object({
  playerId: z.string().uuid(),
  periodType: periodTypeSchema,
  startSecond: z.number().int().nonnegative(),
  endSecond: z.number().int().nonnegative().nullable(),
});

const updateManualSegmentSchema = manualSegmentSchema.partial();

export async function getClock(req: Request, res: Response) {
  const state = await clockService.getClockState(req.params.matchId);
  res.json(state);
}

export async function startPeriod(req: Request, res: Response) {
  const { type } = startPeriodSchema.parse(req.body);
  const state = await clockService.startPeriod(req.params.matchId, type);
  res.json(state);
}

export async function pause(req: Request, res: Response) {
  const state = await clockService.pauseClock(req.params.matchId);
  res.json(state);
}

export async function resume(req: Request, res: Response) {
  const state = await clockService.resumeClock(req.params.matchId);
  res.json(state);
}

export async function endPeriod(req: Request, res: Response) {
  const state = await clockService.endPeriod(req.params.matchId);
  res.json(state);
}

export async function finish(req: Request, res: Response) {
  const state = await clockService.finishMatch(req.params.matchId);
  res.json(state);
}

export async function substitute(req: Request, res: Response) {
  const { playerOutId, playerInId } = substitutionSchema.parse(req.body);
  const state = await clockService.substitute(req.params.matchId, playerOutId, playerInId, req.user!.id);
  res.json(state);
}

export async function listSegments(req: Request, res: Response) {
  const segments = await clockService.listSegments(req.params.matchId);
  res.json({ segments });
}

export async function createSegment(req: Request, res: Response) {
  const data = manualSegmentSchema.parse(req.body);
  const segment = await clockService.createManualSegment(req.params.matchId, data, req.user!.id);
  res.status(201).json({ segment });
}

export async function updateSegment(req: Request, res: Response) {
  const data = updateManualSegmentSchema.parse(req.body);
  const segment = await clockService.updateManualSegment(req.params.matchId, req.params.segmentId, data);
  res.json({ segment });
}

export async function deleteSegment(req: Request, res: Response) {
  await clockService.deleteSegment(req.params.matchId, req.params.segmentId);
  res.status(204).end();
}
