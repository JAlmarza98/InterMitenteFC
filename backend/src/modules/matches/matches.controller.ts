import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { computeLiveElapsedSeconds, segmentDurationSeconds } from "../matchClock/matchClock.service";

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

export async function updateMatch(req: Request, res: Response) {
  const data = updateMatchSchema.parse(req.body);
  const match = await prisma.match.update({ where: { id: req.params.id }, data });
  res.json({ match });
}

export async function deleteMatch(req: Request, res: Response) {
  await prisma.match.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function putSquad(req: Request, res: Response) {
  const { players } = squadSchema.parse(req.body);
  const matchId = req.params.id;

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
