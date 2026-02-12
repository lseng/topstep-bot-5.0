import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../src/lib/logger';
import { isDatabaseConfigured } from '../src/lib/db';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  logger.info('Debug endpoint hit');
  res.status(200).json({
    nodeVersion: process.version,
    dbConfigured: isDatabaseConfigured(),
    envVars: {
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'missing',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'set' : 'missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing',
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ? 'set' : 'missing',
    },
  });
}
