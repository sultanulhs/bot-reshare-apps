import { z } from 'zod';

export const envSchema = z.object({
  DANA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  X_PARTNER_ID: z.string().min(1),
  PRIVATE_KEY: z.string().min(1),
  ORIGIN: z.string().url(),
  DANA_PUBLIC_KEY: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  CREDENTIAL_ENC_KEY: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  ORDER_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  ORDER_FULFILL_SLA_MINUTES: z.coerce.number().int().positive().default(60),
  REPORT_SLA_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;
