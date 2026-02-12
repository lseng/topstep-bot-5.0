// Alert storage service - persists webhook alerts to the database

import { createHash } from 'node:crypto';
import { query } from '../lib/db';
import { logger } from '../lib/logger';
import type { AlertRecord, AlertStatus, ParsedWebhookPayload } from '../types';

/**
 * Hash the webhook secret for audit storage (never store raw secrets)
 */
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Save a parsed webhook alert to the database
 * Returns the generated alert ID on success
 */
export async function saveAlert(payload: ParsedWebhookPayload): Promise<string> {
  const secretHash = hashSecret(payload.secret);
  const alertTime = payload.alertTime ?? null;
  const interval = payload.interval ?? null;
  const openPrice = payload.ohlcv?.open ?? null;
  const highPrice = payload.ohlcv?.high ?? null;
  const lowPrice = payload.ohlcv?.low ?? null;
  const closePrice = payload.ohlcv?.close ?? null;
  const barVolume = payload.ohlcv?.volume ?? null;
  const orderType = payload.orderType ?? null;
  const price = payload.price ?? null;
  const stopLoss = payload.stopLoss ?? null;
  const takeProfit = payload.takeProfit ?? null;
  const comment = payload.comment ?? null;
  const status: AlertStatus = 'received';

  try {
    const result = await query<Pick<AlertRecord, 'id'>>`
      INSERT INTO alerts (
        secret_hash, symbol, action, quantity,
        interval, alert_time,
        open_price, high_price, low_price, close_price, bar_volume,
        order_type, price, stop_loss, take_profit,
        comment, status
      ) VALUES (
        ${secretHash}, ${payload.symbol}, ${payload.action}, ${payload.quantity},
        ${interval}, ${alertTime},
        ${openPrice}, ${highPrice}, ${lowPrice}, ${closePrice}, ${barVolume},
        ${orderType}, ${price}, ${stopLoss}, ${takeProfit},
        ${comment}, ${status}
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
