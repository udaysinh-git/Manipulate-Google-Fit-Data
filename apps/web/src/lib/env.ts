import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URL: z.string().url(),
  APP_ENCRYPTION_KEY: z.string().min(32),
  APP_BASE_URL: z.string().url(),
});

export function getEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URL: process.env.GOOGLE_OAUTH_REDIRECT_URL,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
  });
}
