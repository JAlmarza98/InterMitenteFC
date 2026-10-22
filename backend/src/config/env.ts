import { z } from "zod";

// The placeholder committed in .env.example — valid per the schema below
// (39 chars), but public knowledge the moment it ships in a real deploy.
const EXAMPLE_SESSION_SECRET = "changeme-generate-a-long-random-string";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters")
    .refine((v) => v !== EXAMPLE_SESSION_SECRET, {
      message:
        "SESSION_SECRET is still the .env.example placeholder — generate a real one (e.g. `openssl rand -hex 32`)",
    }),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  // The league's `dato` id on campeonatosmunicipalesmostoles.org: the
  // `data` attribute of the division's link in the site's "Liga" menu.
  // The first number is the competition and changes every season.
  LEAGUE_DIVISION: z.string().default("27849,T2,2º domingos tarde,,1"),
});

export const env = envSchema.parse(process.env);
