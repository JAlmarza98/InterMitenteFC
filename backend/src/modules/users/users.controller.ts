import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { toPublicUser } from "../auth/auth.service";
import { HttpError } from "../../middleware/errorHandler";

const statusQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

const roleBodySchema = z.object({
  role: z.enum(["admin", "coach", "member"]),
});

export async function listUsers(req: Request, res: Response) {
  const { status } = statusQuerySchema.parse(req.query);
  const users = await prisma.user.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "asc" },
  });
  res.json({ users: users.map(toPublicUser) });
}

export async function approveUser(req: Request, res: Response) {
  const targetId = req.params.id;
  if (targetId === req.user!.id) {
    throw new HttpError(400, "You cannot approve yourself");
  }
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { status: "approved", approvedByUserId: req.user!.id, approvedAt: new Date() },
  });
  res.json({ user: toPublicUser(user) });
}

export async function rejectUser(req: Request, res: Response) {
  const targetId = req.params.id;
  if (targetId === req.user!.id) {
    throw new HttpError(400, "You cannot reject yourself");
  }
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { status: "rejected" },
  });
  res.json({ user: toPublicUser(user) });
}

export async function updateUserRole(req: Request, res: Response) {
  const targetId = req.params.id;
  const { role } = roleBodySchema.parse(req.body);
  if (targetId === req.user!.id) {
    throw new HttpError(400, "You cannot change your own role");
  }
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { role },
  });
  res.json({ user: toPublicUser(user) });
}
