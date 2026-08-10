import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";

const createPlayerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  jerseyNumber: z.number().int().positive().nullable().optional(),
  position: z.string().min(1).nullable().optional(),
  secondaryPosition: z.string().min(1).nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
});

const updatePlayerSchema = createPlayerSchema.partial().extend({
  active: z.boolean().optional(),
});

const listQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function listPlayers(req: Request, res: Response) {
  const { includeInactive } = listQuerySchema.parse(req.query);
  const players = await prisma.player.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  res.json({ players });
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
