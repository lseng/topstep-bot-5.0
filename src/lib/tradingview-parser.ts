// TradingView webhook payload parser
// Handles both JSON and CSV formats from TradingView alerts

import type {
  OHLCVData,
  ParsedWebhookPayload,
  PayloadFormat,
  TradeAction,
  TradingViewAlert,
} from '../types';

// Valid trade actions
const VALID_ACTIONS: TradeAction[] = ['buy', 'sell', 'close', 'close_long', 'close_short'];

/**
 * Detects the payload format based on content
 * JSON payloads start with '{', CSV payloads are comma-separated text
 */
export function detectPayloadFormat(content: string): PayloadFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return 'json';
  }
  return 'csv';
}

/**
 * Parses a JSON payload from TradingView
 * Supports both `ticker` and `symbol` fields, with `ticker` taking precedence
 */
export function parseJsonPayload(
  content: string
): { success: true; payload: ParsedWebhookPayload } | { success: false; error: string } {
  let data: TradingViewAlert;

  try {
    data = JSON.parse(content) as TradingViewAlert;
  } catch {
    return { success: false, error: 'Invalid JSON format' };
  }

  return parseTradingViewAlert(data);
}

/**
 * Parses a TradingViewAlert object into a normalized ParsedWebhookPayload
 */
export function parseTradingViewAlert(
  data: TradingViewAlert
): { success: true; payload: ParsedWebhookPayload } | { success: false; error: string } {
  // Validate required secret field
  if (!data.secret || typeof data.secret !== 'string') {
    return { success: false, error: 'Secret is required and must be a string' };
  }

  // Get symbol from ticker or symbol field (ticker takes precedence)
  const symbol = data.ticker || data.symbol;
  if (!symbol || typeof symbol !== 'string') {
    return { success: false, error: 'Either ticker or symbol is required' };
  }

  // Validate action field
  if (!data.action || typeof data.action !== 'string') {
    return { success: false, error: 'Action is required and must be a string' };
  }

  const action = data.action.toLowerCase() as TradeAction;
  if (!VALID_ACTIONS.includes(action)) {
    return { success: false, error: `Action must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  // Default quantity to 1 if not provided
  let quantity = 1;
  if (data.quantity !== undefined && data.quantity !== null) {
    if (typeof data.quantity !== 'number' || data.quantity <= 0) {
      return { success: false, error: 'Quantity must be a positive number' };
    }
    quantity = data.quantity;
  }

  // Parse alert time if provided
  let alertTime: Date | undefined;
  if (data.time) {
    const parsed = new Date(data.time);
    if (!isNaN(parsed.getTime())) {
      alertTime = parsed;
    }
  }

  // Extract OHLCV data
  const ohlcv = extractOHLCV(data);

  // Build the normalized payload
  const payload: ParsedWebhookPayload = {
    secret: data.secret,
    symbol: symbol.toUpperCase(),
    action,
    quantity,
  };

  // Add optional fields
  if (data.interval) {
    payload.interval = String(data.interval);
  }
  if (alertTime) {
    payload.alertTime = alertTime;
  }
  if (ohlcv) {
    payload.ohlcv = ohlcv;
  }
  if (data.orderType) {
    payload.orderType = data.orderType;
  }
  if (data.price !== undefined) {
    payload.price = data.price;
  }
  if (data.stopLoss !== undefined) {
    payload.stopLoss = data.stopLoss;
  }
  if (data.takeProfit !== undefined) {
    payload.takeProfit = data.takeProfit;
  }
  if (data.comment) {
    payload.comment = data.comment;
  }

  return { success: true, payload };
}

/**
 * Extracts OHLCV data from a TradingView alert
 * Returns undefined if no OHLCV fields are present
 */
function extractOHLCV(data: TradingViewAlert): OHLCVData | undefined {
  const ohlcv: OHLCVData = {};
  let hasData = false;

  if (typeof data.open === 'number') {
    ohlcv.open = data.open;
    hasData = true;
  }
  if (typeof data.high === 'number') {
    ohlcv.high = data.high;
    hasData = true;
  }
  if (typeof data.low === 'number') {
    ohlcv.low = data.low;
    hasData = true;
  }
  if (typeof data.close === 'number') {
    ohlcv.close = data.close;
    hasData = true;
  }
  if (typeof data.volume === 'number') {
    ohlcv.volume = data.volume;
    hasData = true;
  }

  return hasData ? ohlcv : undefined;
}

/**
 * Parses a CSV payload from TradingView
 * CSV field order as per spec:
 * secret, action, ticker, interval, time, open, close, high, low, volume, quantity
 * Format: secret, action, ticker, interval, time, open, close, high, low, volume, quantity
 */
export function parseCsvPayload(
  content: string
): { success: true; payload: ParsedWebhookPayload } | { success: false; error: string } {
  const fields = content
    .trim()
    .split(',')
    .map((f) => f.trim());

  // Minimum required fields: secret, action, ticker (first 3)
  if (fields.length < 3) {
    return { success: false, error: 'CSV payload must have at least secret, action, and ticker' };
  }

  const [secret, action, ticker] = fields;

  // Validate secret
  if (!secret) {
    return { success: false, error: 'Secret is required' };
  }

  // Validate action
  if (!action) {
    return { success: false, error: 'Action is required' };
  }
  const normalizedAction = action.toLowerCase() as TradeAction;
  if (!VALID_ACTIONS.includes(normalizedAction)) {
    return { success: false, error: `Action must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  // Validate ticker/symbol
  if (!ticker) {
    return { success: false, error: 'Ticker is required' };
  }

  // Build the payload
  const payload: ParsedWebhookPayload = {
    secret,
    symbol: ticker.toUpperCase(),
    action: normalizedAction,
    quantity: 1, // Default
  };

  // Parse optional fields by position
  // Index 3: interval
  if (fields.length > 3 && fields[3]) {
    payload.interval = fields[3];
  }

  // Index 4: time
  if (fields.length > 4 && fields[4]) {
    const parsed = new Date(fields[4]);
    if (!isNaN(parsed.getTime())) {
      payload.alertTime = parsed;
    }
  }

  // OHLCV data: indices 5-9
  const ohlcv: OHLCVData = {};
  let hasOhlcv = false;

  // Index 5: open
  if (fields.length > 5 && fields[5]) {
    const val = parseFloat(fields[5]);
    if (!isNaN(val)) {
      ohlcv.open = val;
      hasOhlcv = true;
    }
  }

  // Index 6: close
  if (fields.length > 6 && fields[6]) {
    const val = parseFloat(fields[6]);
    if (!isNaN(val)) {
      ohlcv.close = val;
      hasOhlcv = true;
    }
  }

  // Index 7: high
  if (fields.length > 7 && fields[7]) {
    const val = parseFloat(fields[7]);
    if (!isNaN(val)) {
      ohlcv.high = val;
      hasOhlcv = true;
    }
  }

  // Index 8: low
  if (fields.length > 8 && fields[8]) {
    const val = parseFloat(fields[8]);
    if (!isNaN(val)) {
      ohlcv.low = val;
      hasOhlcv = true;
    }
  }

  // Index 9: volume
  if (fields.length > 9 && fields[9]) {
    const val = parseInt(fields[9], 10);
    if (!isNaN(val)) {
      ohlcv.volume = val;
      hasOhlcv = true;
    }
  }

  if (hasOhlcv) {
    payload.ohlcv = ohlcv;
  }

  // Index 10: quantity (optional, defaults to 1)
  if (fields.length > 10 && fields[10]) {
    const val = parseInt(fields[10], 10);
    if (!isNaN(val) && val > 0) {
      payload.quantity = val;
    }
  }

  return { success: true, payload };
}

/**
 * Parse webhook payload - auto-detects format and parses accordingly
 */
export function parseWebhookPayload(
  content: string
): { success: true; payload: ParsedWebhookPayload } | { success: false; error: string } {
  if (!content || typeof content !== 'string') {
    return { success: false, error: 'Payload content is required' };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: 'Payload content cannot be empty' };
  }

  const format = detectPayloadFormat(trimmed);

  if (format === 'json') {
    return parseJsonPayload(trimmed);
  }

  return parseCsvPayload(trimmed);
}
