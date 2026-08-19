import { Request, Response } from "express";
import { prisma } from "../../db/prisma";

export async function healthCheck(_req: Request, res: Response) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
    return;
  }
  res.json({ status: "ok", db: "ok" });
}
