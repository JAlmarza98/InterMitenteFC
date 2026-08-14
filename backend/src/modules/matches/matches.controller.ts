import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  closeOpenClockState,
  computeLiveElapsedSeconds,
  getEventStamp,
  segmentDurationSeconds,
} from "../matchClock/matchClock.service";

const matchSchema = z.object({
  seasonId: z.string().uuid().nullable().optional(),
  opponent: z.string().min(1),
  matchDate: z.coerce.date(),
  homeAway: z.enum(["home", "away"]),
  competition: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  periodLengthMinutes: z.number().int().positive().optional(),
});

const updateMatchSchema = matchSchema.partial().extend({
  teamScore: z.number().int().nonnegative().nullable().optional(),
  opponentScore: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["scheduled", "live", "finished"]).optional(),
});

const listQuerySchema = z.object({
  seasonId: z.string().uuid().optional(),
  status: z.enum(["scheduled", "live", "finished"]).optional(),
});

// Fútbol 7: the starting XI is 7 players, no more, no less — also the cap
// on how many can ever be on the pitch at once during the match.
const SQUAD_SIZE = 7;

const squadSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.string().uuid(),
      isStarter: z.boolean().default(false),
    })
  ),
});

const playerStatSchema = z.object({
  goals: z.number().int().nonnegative().optional(),
  assists: z.number().int().nonnegative().optional(),
  yellowCards: z.number().int().min(0).max(2).optional(),
  redCards: z.number().int().min(0).max(1).optional(),
  ownGoals: z.number().int().nonnegative().optional(),
});

const STAT_EVENT_TYPES = ["goal", "assist", "yellow_card", "red_card", "own_goal"] as const;
const LOGGABLE_EVENT_TYPES = [...STAT_EVENT_TYPES, "opponent_goal"] as const;

const matchEventSchema = z
  .object({
    playerId: z.string().uuid().optional(),
    type: z.enum(LOGGABLE_EVENT_TYPES),
  })
  .refine((data) => data.type === "opponent_goal" || !!data.playerId, {
    message: "playerId es obligatorio para este tipo de evento",
    path: ["playerId"],
  });

const STAT_FIELD_BY_EVENT_TYPE: Record<(typeof STAT_EVENT_TYPES)[number], string> = {
  goal: "goals",
  assist: "assists",
  yellow_card: "yellowCards",
  red_card: "redCards",
  own_goal: "ownGoals",
};

// A "goal" adds to our score; an "own_goal" (autogol) is put into our own
// net by one of our players, so it counts for the opponent instead.
const SCORE_FIELD_BY_EVENT_TYPE: Partial<Record<(typeof STAT_EVENT_TYPES)[number], "teamScore" | "opponentScore">> = {
  goal: "teamScore",
  own_goal: "opponentScore",
};

export async function listMatches(req: Request, res: Response) {
  const { seasonId, status } = listQuerySchema.parse(req.query);
  const matches = await prisma.match.findMany({
    where: { seasonId, status },
    orderBy: { matchDate: "desc" },
  });
  res.json({ matches });
}

export async function getMatch(req: Request, res: Response) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      squad: { include: { player: true } },
    },
  });
  res.json({ match });
}

export async function createMatch(req: Request, res: Response) {
  const data = matchSchema.parse(req.body);
  const match = await prisma.match.create({
    data: { ...data, createdByUserId: req.user!.id },
  });
  res.status(201).json({ match });
}

// Match metadata (opponent, date, competition, notes...) stays a coach
// action, but the status and the score are the official record of what
// happened — only admin can move those, regardless of which fields a
// given PATCH request happens to touch.
const ADMIN_ONLY_MATCH_FIELDS = ["status", "teamScore", "opponentScore"] as const;

export async function updateMatch(req: Request, res: Response) {
  const data = updateMatchSchema.parse(req.body);
  const matchId = req.params.id;

  const touchesAdminOnlyField = ADMIN_ONLY_MATCH_FIELDS.some((field) => data[field] !== undefined);
  if (touchesAdminOnlyField && req.user!.role !== "admin") {
    throw new HttpError(403, "Solo un administrador puede cambiar el estado o el marcador del partido");
  }

  if (data.periodLengthMinutes !== undefined) {
    const hasStartedPeriod = await prisma.matchPeriod.findFirst({
      where: { matchId, startedAt: { not: null } },
      select: { id: true },
    });
    if (hasStartedPeriod) {
      throw new HttpError(
        400,
        "No se puede cambiar la duración del período: el partido ya tiene tiempo registrado"
      );
    }
  }

  if (data.status === "finished") {
    const current = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } });
    if (current.status !== "finished") {
      const match = await prisma.$transaction(async (tx) => {
        await closeOpenClockState(tx, matchId, new Date());
        return tx.match.update({ where: { id: matchId }, data });
      });
      res.json({ match });
      return;
    }
  }

  const match = await prisma.match.update({ where: { id: matchId }, data });
  res.json({ match });
}

export async function deleteMatch(req: Request, res: Response) {
  await prisma.match.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function putSquad(req: Request, res: Response) {
  const { players } = squadSchema.parse(req.body);
  const matchId = req.params.id;

  const startersCount = players.filter((p) => p.isStarter).length;
  if (startersCount !== SQUAD_SIZE) {
    throw new HttpError(400, `El equipo titular debe tener exactamente ${SQUAD_SIZE} jugadores (fútbol 7)`);
  }

  await prisma.$transaction([
    prisma.matchSquad.deleteMany({ where: { matchId } }),
    prisma.matchSquad.createMany({
      data: players.map((p) => ({ matchId, playerId: p.playerId, isStarter: p.isStarter })),
    }),
  ]);

  const squad = await prisma.matchSquad.findMany({
    where: { matchId },
    include: { player: true },
  });
  res.json({ squad });
}

export async function upsertPlayerStat(req: Request, res: Response) {
  const data = playerStatSchema.parse(req.body);
  const matchId = req.params.id;
  const playerId = req.params.playerId;

  const stat = await prisma.matchPlayerStat.upsert({
    where: { matchId_playerId: { matchId, playerId } },
    create: { matchId, playerId, ...data },
    update: data,
  });
  res.json({ stat });
}

export async function getMatchStats(req: Request, res: Response) {
  const matchId = req.params.id;

  const [match, squad, playerStats, segments] = await Promise.all([
    prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } }),
    prisma.matchSquad.findMany({ where: { matchId }, include: { player: true } }),
    prisma.matchPlayerStat.findMany({ where: { matchId } }),
    prisma.playingTimeSegment.findMany({ where: { matchId } }),
  ]);

  const liveCurrentSecond = match.status === "live" ? await computeLiveElapsedSeconds(matchId) : null;

  const secondsByPlayer = new Map<string, number>();
  for (const segment of segments) {
    const duration = segmentDurationSeconds(segment, liveCurrentSecond);
    const prev = secondsByPlayer.get(segment.playerId) ?? 0;
    secondsByPlayer.set(segment.playerId, prev + duration);
  }
  const statsByPlayer = new Map(playerStats.map((s) => [s.playerId, s]));

  const players = squad.map((entry) => {
    const stat = statsByPlayer.get(entry.playerId);
    return {
      playerId: entry.playerId,
      player: entry.player,
      isStarter: entry.isStarter,
      secondsPlayed: secondsByPlayer.get(entry.playerId) ?? 0,
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
      yellowCards: stat?.yellowCards ?? 0,
      redCards: stat?.redCards ?? 0,
      ownGoals: stat?.ownGoals ?? 0,
    };
  });

  res.json({ players });
}

export async function logMatchEvent(req: Request, res: Response) {
  const { playerId, type } = matchEventSchema.parse(req.body);
  const matchId = req.params.id;

  const { periodType, second } = await getEventStamp(matchId);

  if (type === "opponent_goal") {
    const [match, event] = await prisma.$transaction(async (tx) => {
      // Atomic SQL increment (vs. read-then-write) so two near-simultaneous
      // goals can't both read the same starting value and lose one.
      // COALESCE handles the score still being NULL (match not yet scored).
      await tx.$executeRaw`UPDATE "Match" SET "opponentScore" = COALESCE("opponentScore", 0) + 1 WHERE id = ${matchId}`;
      const updatedMatch = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
      const createdEvent = await tx.matchEvent.create({
        data: { matchId, type, periodType, second, createdByUserId: req.user!.id },
        include: { player: true, relatedPlayer: true },
      });
      return [updatedMatch, createdEvent] as const;
    });

    res.status(201).json({ match, event });
    return;
  }

  const field = STAT_FIELD_BY_EVENT_TYPE[type as (typeof STAT_EVENT_TYPES)[number]];
  const scoreField = SCORE_FIELD_BY_EVENT_TYPE[type as (typeof STAT_EVENT_TYPES)[number]];

  const [match, stat, event] = await prisma.$transaction(async (tx) => {
    if (scoreField) {
      const column = Prisma.raw(`"${scoreField}"`);
      await tx.$executeRaw`UPDATE "Match" SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ${matchId}`;
    }
    const updatedMatch = scoreField ? await tx.match.findUniqueOrThrow({ where: { id: matchId } }) : null;
    const upsertedStat = await tx.matchPlayerStat.upsert({
      where: { matchId_playerId: { matchId, playerId: playerId! } },
      create: { matchId, playerId: playerId!, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
    const createdEvent = await tx.matchEvent.create({
      data: { matchId, playerId, type, periodType, second, createdByUserId: req.user!.id },
      include: { player: true },
    });

    // A red card sends the player off for the rest of the match: close
    // their playing-time segment right now instead of leaving it open (and
    // ticking) until someone remembers to substitute them out.
    if (type === "red_card") {
      await tx.playingTimeSegment.updateMany({
        where: { matchId, playerId: playerId!, endSecond: null },
        data: { endSecond: second, endedAt: new Date() },
      });
    }

    return [updatedMatch, upsertedStat, createdEvent] as const;
  });

  res.status(201).json({ match, stat, event });
}

export async function listMatchEvents(req: Request, res: Response) {
  const events = await prisma.matchEvent.findMany({
    where: { matchId: req.params.id },
    include: { player: true, relatedPlayer: true },
    orderBy: [{ second: "asc" }, { createdAt: "asc" }],
  });
  res.json({ events });
}
