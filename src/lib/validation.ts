// Webhook request validation utilities

import type {
  OHLCVData,
  ParsedWebhookPayload,
  TradeAction,
  ValidationError,
  WebhookAlert,
} from '../types';

// Valid trade actions
const VALID_ACTIONS: TradeAction[] = ['buy', 'sell', 'close', 'close_long', 'close_short'];

/**
 * Normalizes a TradingView symbol by stripping continuous contract suffixes.
 * e.g., "MES1!" → "MES", "NQ2!" → "NQ", "ES" → "ES"
 */
export function normalizeSymbol(symbol: string): string {
  const match = symbol.trim().match(/^(.+?)\d+!$/);
  return (match ? match[1] : symbol.trim()).toUpperCase();
}

/**
 * Validates that the provided secret matches the WEBHOOK_SECRET environment variable
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return false;
  }
  return secret === webhookSecret;
}

/**
 * Validates a webhook payload and returns validation result
 */
export function validateWebhookPayload(body: unknown): {
  valid: boolean;
  errors?: ValidationError[];
  payload?: WebhookAlert;
} {
  const errors: ValidationError[] = [];

  // Check if body is an object
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = body as Record<string, unknown>;

  // Check required fields
  if (!data.secret || typeof data.secret !== 'string') {
    errors.push({ field: 'secret', message: 'Secret is required and must be a string' });
  }

  if (!data.symbol || typeof data.symbol !== 'string') {
    errors.push({ field: 'symbol', message: 'Symbol is required and must be a string' });
  }

  if (!data.action || typeof data.action !== 'string') {
    errors.push({ field: 'action', message: 'Action is required and must be a string' });
  } else if (!VALID_ACTIONS.includes(data.action as TradeAction)) {
    errors.push({
      field: 'action',
      message: `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
    });
  }

  if (data.quantity === undefined || data.quantity === null) {
    errors.push({ field: 'quantity', message: 'Quantity is required' });
  } else if (typeof data.quantity !== 'number') {
    errors.push({ field: 'quantity', message: 'Quantity must be a number' });
  } else if (data.quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Quantity must be a positive number' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated payload
  const payload: WebhookAlert = {
    secret: data.secret as string,
    symbol: normalizeSymbol(data.symbol as string),
    action: data.action as TradeAction,
    quantity: data.quantity as number,
  };

  // Add optional fields if present
  if (data.orderType && typeof data.orderType === 'string') {
    payload.orderType = data.orderType as WebhookAlert['orderType'];
  }
  if (typeof data.price === 'number' || data.price === null) {
    payload.price = data.price;
  }
  if (typeof data.stopLoss === 'number') {
    payload.stopLoss = data.stopLoss;
  }
  if (typeof data.takeProfit === 'number') {
    payload.takeProfit = data.takeProfit;
  }
  if (typeof data.comment === 'string') {
    payload.comment = data.comment;
  }

  return { valid: true, payload };
}

/**
 * Validates a TradingView webhook payload with support for OHLCV data
 * - Accepts `ticker` as alternative to `symbol`
 * - Makes `quantity` optional (defaults to 1)
 * - Validates optional OHLCV numeric fields
 * - Validates optional `interval` and `time` fields
 */
export function validateTradingViewPayload(body: unknown): {
  valid: boolean;
  errors?: ValidationError[];
  payload?: ParsedWebhookPayload;
} {
  const errors: ValidationError[] = [];

  // Check if body is an object
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = body as Record<string, unknown>;

  // Check required secret field
  if (!data.secret || typeof data.secret !== 'string') {
    errors.push({ field: 'secret', message: 'Secret is required and must be a string' });
  }

  // Check symbol - accept either `ticker` or `symbol` field
  const symbol = data.ticker ?? data.symbol;
  if (!symbol || typeof symbol !== 'string') {
    errors.push({ field: 'symbol', message: 'Either ticker or symbol is required and must be a string' });
  }

  // Check action field
  if (!data.action || typeof data.action !== 'string') {
    errors.push({ field: 'action', message: 'Action is required and must be a string' });
  } else if (!VALID_ACTIONS.includes(data.action.toLowerCase() as TradeAction)) {
    errors.push({
      field: 'action',
      message: `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
    });
  }

  // Quantity is optional, default to 1, but must be positive if provided
  if (data.quantity !== undefined && data.quantity !== null) {
    if (typeof data.quantity !== 'number') {
      errors.push({ field: 'quantity', message: 'Quantity must be a number' });
    } else if (data.quantity <= 0) {
      errors.push({ field: 'quantity', message: 'Quantity must be a positive number' });
    }
  }

  // Validate OHLCV fields (all optional, but must be numbers if provided)
  const ohlcvFields = ['open', 'high', 'low', 'close'] as const;
  for (const field of ohlcvFields) {
    if (data[field] !== undefined && data[field] !== null && typeof data[field] !== 'number') {
      errors.push({ field, message: `${field} must be a number` });
    }
  }

  // Volume must be a non-negative number if provided
  if (data.volume !== undefined && data.volume !== null) {
    if (typeof data.volume !== 'number') {
      errors.push({ field: 'volume', message: 'Volume must be a number' });
    } else if (data.volume < 0) {
      errors.push({ field: 'volume', message: 'Volume must be non-negative' });
    }
  }

  // Validate interval field (optional string)
  if (data.interval !== undefined && data.interval !== null && typeof data.interval !== 'string') {
    errors.push({ field: 'interval', message: 'Interval must be a string' });
  }

  // Validate time field (optional, must be valid ISO timestamp)
  if (data.time !== undefined && data.time !== null) {
    if (typeof data.time !== 'string') {
      errors.push({ field: 'time', message: 'Time must be a string' });
    } else {
      const parsed = new Date(data.time);
      if (isNaN(parsed.getTime())) {
        errors.push({ field: 'time', message: 'Time must be a valid ISO timestamp' });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated payload
  const payload: ParsedWebhookPayload = {
    secret: data.secret as string,
    symbol: normalizeSymbol(symbol as string),
    action: (data.action as string).toLowerCase() as TradeAction,
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
  };

  // Add optional interval
  if (typeof data.interval === 'string') {
    payload.interval = data.interval;
  }

  // Add optional alert time
  if (typeof data.time === 'string') {
    const parsed = new Date(data.time);
    if (!isNaN(parsed.getTime())) {
      payload.alertTime = parsed;
    }
  }

  // Extract OHLCV data
  const ohlcv: OHLCVData = {};
  let hasOhlcv = false;

  if (typeof data.open === 'number') {
    ohlcv.open = data.open;
    hasOhlcv = true;
  }
  if (typeof data.high === 'number') {
    ohlcv.high = data.high;
    hasOhlcv = true;
  }
  if (typeof data.low === 'number') {
    ohlcv.low = data.low;
    hasOhlcv = true;
  }
  if (typeof data.close === 'number') {
    ohlcv.close = data.close;
    hasOhlcv = true;
  }
  if (typeof data.volume === 'number') {
    ohlcv.volume = data.volume;
    hasOhlcv = true;
  }

  if (hasOhlcv) {
    payload.ohlcv = ohlcv;
  }

  // Add other optional fields
  if (data.orderType && typeof data.orderType === 'string') {
    payload.orderType = data.orderType as ParsedWebhookPayload['orderType'];
  }
  if (typeof data.price === 'number' || data.price === null) {
    payload.price = data.price;
  }
  if (typeof data.stopLoss === 'number') {
    payload.stopLoss = data.stopLoss;
  }
  if (typeof data.takeProfit === 'number') {
    payload.takeProfit = data.takeProfit;
  }
  if (typeof data.comment === 'string') {
    payload.comment = data.comment;
  }
  if (typeof data.name === 'string') {
    payload.name = data.name;
  }

  return { valid: true, payload };
}
