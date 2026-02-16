// Raw webhook storage service - persists raw TradingView payloads to the database

import { getSupabase } from '../lib/supabase';
import { logger } from '../lib/logger';

type RawWebhookTable = 'sfx_algo_alerts';

/**
 * Save a raw webhook payload to the specified table.
 * Returns the generated event ID on success.
 */
export async function saveRawWebhook(
  table: RawWebhookTable,
  params: { source: string; rawBody: string; contentType: string | null },
): Promise<string> {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from(table)
      .insert({
        source: params.source,
        raw_body: params.rawBody,
        content_type: params.contentType,
      } as never)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const eventId = (data as { id: string }).id;
    logger.info('Raw webhook saved', { table, eventId, source: params.source });
    return eventId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Failed to save raw webhook', { error: errorMessage, table });
    throw new Error(`Failed to save raw webhook: ${errorMessage}`);
  }
}
