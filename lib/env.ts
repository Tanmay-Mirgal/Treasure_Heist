import { z } from "zod";

/**
 * Server-side environment configuration. Never import this module from a
 * Client Component: it reads secrets that must not reach the browser.
 */
const EnvSchema = z.object({
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is required (MongoDB connection string)." })
    .min(1, "MONGODB_URI is required (MongoDB connection string).")
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), "MONGODB_URI must start with mongodb:// or mongodb+srv://"),
  MONGODB_DB: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters."),
  ADMIN_USERNAME: z.string().min(1).default("Tanmay"),
  ADMIN_INITIAL_PASSWORD: z.string().min(1).default("Tanmay123"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

/** Development-only fallback secret. Refused in production. */
const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const raw = {
    // MONGO_URI is accepted for compatibility with the original project .env.
    MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI,
    MONGODB_DB: process.env.MONGODB_DB || undefined,
    SESSION_SECRET:
      process.env.SESSION_SECRET ||
      (process.env.NODE_ENV === "production" ? undefined : DEV_SESSION_SECRET),
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || undefined,
    ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || undefined,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS || undefined,
    NODE_ENV: process.env.NODE_ENV || undefined,
  };
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid server environment configuration:\n${details}\n` +
        `Copy .env.example to .env.local and fill in the values (see README → Environment).`,
    );
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set to a unique random value in production.");
  }
  cached = parsed.data;
  return cached;
}

/** Session secret only (used by proxy.ts, which must not require database settings). */
export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? null : DEV_SESSION_SECRET);
  return s && s.length >= 32 ? s : null;
}

/** For tests: forget the cached env so changed process.env values are re-read. */
export function resetEnvCache() {
  cached = null;
}

export const isProduction = () => process.env.NODE_ENV === "production";
