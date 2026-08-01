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
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  };
}
