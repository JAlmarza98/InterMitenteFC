import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existingAdmin) {
    console.log("An admin user already exists, skipping bootstrap.");
    return;
  }

  if (!env.ADMIN_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    console.log("ADMIN_EMAIL/ADMIN_BOOTSTRAP_PASSWORD not set, skipping admin bootstrap.");
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_BOOTSTRAP_PASSWORD, 12);
  await prisma.user.create({
    data: {
      email: env.ADMIN_EMAIL,
      passwordHash,
      name: "Administrador",
      role: "admin",
      status: "approved",
      approvedAt: new Date(),
    },
  });
  console.log(`Bootstrap admin created: ${env.ADMIN_EMAIL}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
