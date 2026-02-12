// Alert storage service - persists webhook alerts to the database

import { query } from '../lib/db';
import { logger } from '../lib/logger';
import type { AlertRecord, AlertStatus, ParsedWebhookPayload } from '../types';

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

  return raw;
}

/**
 * Save a parsed webhook alert to the database
 * Returns the generated alert ID on success
 */
export async function saveAlert(payload: ParsedWebhookPayload): Promise<string> {
  const orderType = payload.orderType ?? 'market';
  const price = payload.price ?? null;
  const stopLoss = payload.stopLoss ?? null;
  const takeProfit = payload.takeProfit ?? null;
  const comment = payload.comment ?? null;
  const status: AlertStatus = 'received';
  const rawPayload = JSON.stringify(buildRawPayload(payload));

  try {
    const result = await query<Pick<AlertRecord, 'id'>>`
      INSERT INTO alerts (
        symbol, action, quantity,
        order_type, price, stop_loss, take_profit,
        comment, status, raw_payload
      ) VALUES (
        ${payload.symbol}, ${payload.action}, ${payload.quantity},
        ${orderType}, ${price}, ${stopLoss}, ${takeProfit},
        ${comment}, ${status}, ${rawPayload}::jsonb
      )
      RETURNING id
    `;

    const alertId = result[0].id;
    logger.info('Alert saved to database', { alertId, symbol: payload.symbol });
    return alertId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Failed to save alert', { error: errorMessage, symbol: payload.symbol });
    throw new Error(`Failed to save alert: ${errorMessage}`);
  }
}
