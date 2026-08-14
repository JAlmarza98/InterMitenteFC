import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { registerUser, verifyCredentials, toPublicUser } from "./auth.service";

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export async function register(req: Request, res: Response) {
  const { email, password, name } = registerSchema.parse(req.body);
  const user = await registerUser(email, password, name);
  res.status(201).json({
    user: toPublicUser(user),
    message: "Registro recibido. Un administrador debe aprobar tu cuenta antes de poder acceder.",
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const user = await verifyCredentials(email, password);

  if (user.status === "pending") {
    throw new HttpError(403, "Tu cuenta está pendiente de aprobación por un administrador");
  }
  if (user.status === "rejected") {
    throw new HttpError(403, "Tu solicitud de acceso ha sido rechazada");
  }

  req.session.userId = user.id;
  res.json({ user: toPublicUser(user) });
}

export async function logout(req: Request, res: Response) {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
}

export async function me(req: Request, res: Response) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ user: null });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ user: null });
  }
  res.json({ user: toPublicUser(user) });
}
