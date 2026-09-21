import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

const SALT_ROUNDS = 12;

export async function registerUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return prisma.user.create({
    data: { email, passwordHash, name },
  });
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  if (user.status !== "approved") {
    return user; // caller decides how to surface pending/rejected state
  }

  return user;
}

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  passwordResetRequestedAt?: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    passwordResetRequested: Boolean(user.passwordResetRequestedAt),
  };
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Flags the account so the admin panel surfaces the request. Silent when
 * the email is unknown: the endpoint must not reveal who has an account. */
export async function requestPasswordReset(email: string) {
  await prisma.user.updateMany({
    where: { email },
    data: { passwordResetRequestedAt: new Date() },
  });
}

/** Mints a one-use token for `userId` and returns the plaintext — the only
 * time it exists outside the DB. Any previous token is overwritten. */
export async function createPasswordResetToken(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      passwordResetRequestedAt: null,
    },
  });
  return { token, expiresInMinutes: RESET_TOKEN_TTL_MS / 60000 };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { passwordResetTokenHash: hashToken(token) },
  });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new HttpError(400, "El enlace de recuperación no es válido o ha caducado");
  }

  await setPassword(user.id, newPassword);
  return user;
}

/** Writes a new password and clears any outstanding reset token, so a link
 * generated earlier can't be replayed after the password already changed. */
export async function setPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetRequestedAt: null,
    },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new HttpError(400, "La contraseña actual no es correcta");
  }
  return setPassword(userId, newPassword);
}
