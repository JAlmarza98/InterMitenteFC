import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "approved") {
    return res.status(401).json({ error: "Not authenticated" });
  }

  req.user = user;
  next();
}
