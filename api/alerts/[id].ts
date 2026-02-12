import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../src/lib/supabase';
import type { AlertDetailResponse } from '../../src/types';
import type { AlertRow } from '../../src/types/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const id = String(req.query.id ?? '');

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({ success: false, error: 'Invalid alert ID format' });
    return;
  }

  try {
    const { data, error } = await getSupabase()
      .from('alerts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }

    const alert: AlertRow = data;

    // Extract OHLCV data from raw_payload if present
    const rawPayload = alert.raw_payload;
    let ohlcv: AlertDetailResponse['data']['ohlcv'] | undefined;

    if (rawPayload) {
      const hasOhlcv =
        rawPayload.open !== undefined ||
        rawPayload.high !== undefined ||
        rawPayload.low !== undefined ||
        rawPayload.close !== undefined ||
        rawPayload.volume !== undefined;

      if (hasOhlcv) {
        ohlcv = {
          open: typeof rawPayload.open === 'number' ? rawPayload.open : null,
          high: typeof rawPayload.high === 'number' ? rawPayload.high : null,
          low: typeof rawPayload.low === 'number' ? rawPayload.low : null,
          close: typeof rawPayload.close === 'number' ? rawPayload.close : null,
          volume: typeof rawPayload.volume === 'number' ? rawPayload.volume : null,
        };
      }
    }

    const response: AlertDetailResponse = {
      success: true,
      data: { ...alert, ohlcv },
    };

    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Internal server error', details: message });
  }
}
