import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";

const matchSchema = z.object({
  seasonId: z.string().uuid().nullable().optional(),
  opponent: z.string().min(1),
  matchDate: z.coerce.date(),
  homeAway: z.enum(["home", "away"]),
  competition: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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
