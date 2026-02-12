import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const results: Record<string, string> = {};

  // Test each import individually
  try {
    await import('../src/lib/logger');
    results.logger = 'ok';
  } catch (e) {
    results.logger = e instanceof Error ? e.message : String(e);
  }

  try {
    await import('../src/lib/validation');
    results.validation = 'ok';
  } catch (e) {
    results.validation = e instanceof Error ? e.message : String(e);
  }

  try {
    await import('../src/lib/tradingview-parser');
    results.parser = 'ok';
  } catch (e) {
    results.parser = e instanceof Error ? e.message : String(e);
  }

  try {
    await import('../src/lib/db');
    results.db = 'ok';
  } catch (e) {
    results.db = e instanceof Error ? e.message : String(e);
  }

  try {
    await import('../src/services/alert-storage');
    results.alertStorage = 'ok';
  } catch (e) {
    results.alertStorage = e instanceof Error ? e.message : String(e);
  }

  try {
    await import('../src/lib/supabase');
    results.supabase = 'ok';
  } catch (e) {
    results.supabase = e instanceof Error ? e.message : String(e);
  }

  results.nodeVersion = process.version;
  results.DATABASE_URL = process.env.DATABASE_URL ? 'set' : 'missing';
  results.SUPABASE_URL = process.env.SUPABASE_URL ? 'set' : 'missing';
  results.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing';
  results.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ? 'set' : 'missing';

  res.status(200).json(results);
}
