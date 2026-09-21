import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  registerUser,
  verifyCredentials,
  toPublicUser,
  requestPasswordReset,
  resetPasswordWithToken,
  changePassword,
} from "./auth.service";

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
    res.clearCookie("im.sid");
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

const passwordResetRequestSchema = z.object({
  email: z.string().email().max(255),
});

const passwordResetSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function requestPasswordResetHandler(req: Request, res: Response) {
  const { email } = passwordResetRequestSchema.parse(req.body);
  await requestPasswordReset(email);
  // Always the same answer, whether or not the email exists — otherwise
  // this endpoint becomes a way to enumerate accounts.
  res.json({
    message:
      "Si el email está registrado, un administrador recibirá tu solicitud y te hará llegar un enlace para restablecer la contraseña.",
  });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = passwordResetSchema.parse(req.body);
  await resetPasswordWithToken(token, password);
  res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
}

export async function changeOwnPassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await changePassword(req.user!.id, currentPassword, newPassword);
  res.json({ message: "Contraseña actualizada." });
}
