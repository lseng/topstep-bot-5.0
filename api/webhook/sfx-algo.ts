import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../../src/lib/logger';
import { validateWebhookSecret } from '../../src/lib/validation';
import { getSupabase } from '../../src/lib/supabase';
import { parseSfxAlgoAlert } from '../../src/services/sfx-algo-parser';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const secret = String(req.query.secret ?? '');
  if (!validateWebhookSecret(secret)) {
    logger.warn('Invalid webhook secret on sfx-algo endpoint');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
  const contentType = (req.headers['content-type'] as string) ?? null;

  try {
    const parsed = parseSfxAlgoAlert(rawBody);

    const { data, error } = await getSupabase()
      .from('sfx_algo_alerts')
      .insert({
        source: 'sfx-algo',
        raw_body: rawBody,
        content_type: contentType,
        ticker: parsed?.ticker ?? null,
        symbol: parsed?.symbol ?? null,
        alert_type: parsed?.alertType ?? null,
        signal_direction: parsed?.signalDirection ?? null,
        price: parsed?.price ?? null,
        current_rating: parsed?.currentRating ?? null,
        tp1: parsed?.tp1 ?? null,
        tp2: parsed?.tp2 ?? null,
        tp3: parsed?.tp3 ?? null,
        stop_loss: parsed?.stopLoss ?? null,
        entry_price: parsed?.entryPrice ?? null,
        unix_time: parsed?.unixTime ?? null,
      } as never)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const eventId = (data as { id: string }).id;
    logger.info('SFX algo alert saved', { eventId, alertType: parsed?.alertType, symbol: parsed?.symbol });
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to store sfx-algo webhook', { error: message });
    res.status(500).json({ success: false, error: 'Storage error' });
  }
}
