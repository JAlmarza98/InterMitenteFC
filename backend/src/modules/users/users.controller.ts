import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { toPublicUser } from "../auth/auth.service";
import { HttpError } from "../../middleware/errorHandler";
import { paginationSchema, toSkipTake } from "../../utils/pagination";

const statusQuerySchema = paginationSchema.extend({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

const roleBodySchema = z.object({
  role: z.enum(["admin", "coach", "member"]),
});

function assertNotSelf(req: Request, targetId: string, message: string) {
  if (targetId === req.user!.id) {
    throw new HttpError(400, message);
  }
}

export async function listUsers(req: Request, res: Response) {
  const { status, ...pagination } = statusQuerySchema.parse(req.query);
  const where = status ? { status } : undefined;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      ...toSkipTake(pagination),
    }),
    pagination.limit ? prisma.user.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({ users: users.map(toPublicUser), total });
}

export async function approveUser(req: Request, res: Response) {
  const targetId = req.params.id;
  assertNotSelf(req, targetId, "You cannot approve yourself");
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { status: "approved", approvedByUserId: req.user!.id, approvedAt: new Date() },
  });
  res.json({ user: toPublicUser(user) });
}

export async function rejectUser(req: Request, res: Response) {
  const targetId = req.params.id;
  assertNotSelf(req, targetId, "You cannot reject yourself");
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { status: "rejected" },
  });
  res.json({ user: toPublicUser(user) });
}

export async function updateUserRole(req: Request, res: Response) {
  const targetId = req.params.id;
  const { role } = roleBodySchema.parse(req.body);
  assertNotSelf(req, targetId, "You cannot change your own role");
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { role },
  });
  res.json({ user: toPublicUser(user) });
}
