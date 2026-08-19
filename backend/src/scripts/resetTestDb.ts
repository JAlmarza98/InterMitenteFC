import { prisma } from "../db/prisma";
import { env } from "../config/env";

async function main() {
  if (env.NODE_ENV !== "test") {
    throw new Error("resetTestDb only runs with NODE_ENV=test — refusing to truncate a non-test database");
  }

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'session')
  `;
  if (rows.length === 0) return;

  const quoted = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log(`Truncated ${rows.length} tables.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
