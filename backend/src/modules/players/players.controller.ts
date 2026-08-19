import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { paginationSchema, toSkipTake } from "../../utils/pagination";

const createPlayerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  jerseyNumber: z.number().int().positive().nullable().optional(),
  position: z.string().min(1).max(50).nullable().optional(),
  secondaryPosition: z.string().min(1).max(50).nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
});

const updatePlayerSchema = createPlayerSchema.partial().extend({
  active: z.boolean().optional(),
});

const listQuerySchema = paginationSchema.extend({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function listPlayers(req: Request, res: Response) {
  const { includeInactive, ...pagination } = listQuerySchema.parse(req.query);
  const where = includeInactive ? undefined : { active: true };
  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      ...toSkipTake(pagination),
    }),
    pagination.limit ? prisma.player.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({ players, total });
}

export async function getPlayer(req: Request, res: Response) {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ player });
}

export async function createPlayer(req: Request, res: Response) {
  const data = createPlayerSchema.parse(req.body);
  const player = await prisma.player.create({ data });
  res.status(201).json({ player });
}

export async function updatePlayer(req: Request, res: Response) {
  const data = updatePlayerSchema.parse(req.body);
  const player = await prisma.player.update({ where: { id: req.params.id }, data });
  res.json({ player });
}
