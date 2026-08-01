import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { registerUser, verifyCredentials, toPublicUser } from "./auth.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
