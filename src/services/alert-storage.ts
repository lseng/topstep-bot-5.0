// Alert storage service - persists webhook alerts to the database

import { getSupabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import type { AlertStatus, ParsedWebhookPayload } from '../types';
import type { AlertInsert } from '../types/database';

/**
 * Build raw_payload JSONB from the parsed webhook payload
 */
function buildRawPayload(payload: ParsedWebhookPayload): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    action: payload.action,
    symbol: payload.symbol,
    quantity: payload.quantity,
  };

  if (payload.interval) raw.interval = payload.interval;
  if (payload.alertTime) raw.alertTime = payload.alertTime.toISOString();
  if (payload.ohlcv?.open !== undefined) raw.open = payload.ohlcv.open;
  if (payload.ohlcv?.high !== undefined) raw.high = payload.ohlcv.high;
  if (payload.ohlcv?.low !== undefined) raw.low = payload.ohlcv.low;
  if (payload.ohlcv?.close !== undefined) raw.close = payload.ohlcv.close;
  if (payload.ohlcv?.volume !== undefined) raw.volume = payload.ohlcv.volume;
  if (payload.orderType) raw.orderType = payload.orderType;
  if (payload.price !== undefined) raw.price = payload.price;
  if (payload.stopLoss !== undefined) raw.stopLoss = payload.stopLoss;
  if (payload.takeProfit !== undefined) raw.takeProfit = payload.takeProfit;
  if (payload.comment) raw.comment = payload.comment;
  if (payload.strategy) raw.strategy = payload.strategy;

  return raw;
}

/**
 * Save a parsed webhook alert to the database
 * Returns the generated alert ID on success
 */
export async function saveAlert(payload: ParsedWebhookPayload): Promise<string> {
  const status: AlertStatus = 'received';

  try {
    const supabase = getSupabase();
    const row: AlertInsert = {
      symbol: payload.symbol,
      action: payload.action,
      quantity: payload.quantity,
      order_type: payload.orderType ?? 'market',
      price: payload.price ?? payload.ohlcv?.open ?? null,
      stop_loss: payload.stopLoss ?? null,
      take_profit: payload.takeProfit ?? null,
      comment: payload.comment ?? null,
      status,
      raw_payload: buildRawPayload(payload),
    };

    const { data, error } = await supabase
      .from('alerts')
      .insert(row as never)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const alertId = (data as { id: string }).id;
    logger.info('Alert saved to database', { alertId, symbol: payload.symbol });
    return alertId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Failed to save alert', { error: errorMessage, symbol: payload.symbol });
    throw new Error(`Failed to save alert: ${errorMessage}`);
  }
}
