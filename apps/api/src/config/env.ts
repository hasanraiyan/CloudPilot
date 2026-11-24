import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  HOST: z.string().min(1).default("127.0.0.1"),
  API_VERSION: z.string().trim().min(1).default("v1"),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  DATABASE_URL: z.string().trim().min(1).startsWith("postgresql://"),
  REDIS_URL: z.string().trim().min(1).startsWith("redis://"),
  GITHUB_CLIENT_ID: z.string().trim().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().trim().min(1).optional(),
  GITHUB_CALLBACK_URL: z.string().trim().url().optional(),
  AUTH_SECRET: z.string().trim().min(32).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
});
