import { prisma } from "../../src/db/prisma";

let cachedTableNames: string[] | null = null;

async function getTableNames(): Promise<string[]> {
  if (cachedTableNames) return cachedTableNames;
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'session')
  `;
  cachedTableNames = rows.map((r) => r.tablename);
  return cachedTableNames;
}

/** Truncates every application table (session store excluded on purpose —
 * express-session manages that table's lifecycle itself) so each test starts
 * from a clean, empty database. */
export async function resetDb(): Promise<void> {
  const tables = await getTableNames();
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
