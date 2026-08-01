import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";

const seasonSchema = z.object({
  name: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().optional(),
});

const updateSeasonSchema = seasonSchema.partial();

export async function listSeasons(_req: Request, res: Response) {
  const seasons = await prisma.season.findMany({ orderBy: { startDate: "desc" } });
  res.json({ seasons });
}

export async function createSeason(req: Request, res: Response) {
  const data = seasonSchema.parse(req.body);
  const season = await prisma.season.create({ data });
  res.status(201).json({ season });
}

export async function updateSeason(req: Request, res: Response) {
  const data = updateSeasonSchema.parse(req.body);
  const season = await prisma.season.update({ where: { id: req.params.id }, data });
  res.json({ season });
}
