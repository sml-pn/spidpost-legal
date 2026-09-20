import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  ML_CLIENT_ID: z.string(),
  ML_CLIENT_SECRET: z.string(),
  ML_REDIRECT_URI: z.string(),
  ML_USER_ID: z.string(),
  ML_ACCESS_TOKEN: z.string(),
  ML_REFRESH_TOKEN: z.string(),
  META_APP_ID: z.string(),
  META_APP_SECRET: z.string(),
  IG_USER_ID: z.string(),
  IG_USERNAME: z.string().optional(),
  PAGE_ID: z.string(),
  PAGE_TOKEN: z.string(),
  USER_TOKEN_LONGO: z.string(),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
