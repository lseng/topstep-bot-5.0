// Parser for SFX Algo TradingView webhook payloads

import { normalizeSymbol } from '../lib/validation';

export interface ParsedSfxAlert {
  ticker: string;
  symbol: string;
  alertType: string;
  signalDirection: string;
  price: number;
  currentRating: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopLoss: number | null;
  entryPrice: number | null;
  unixTime: number;
}

const VALID_ALERT_TYPES = ['buy', 'sell', 'TP1', 'TP2', 'TP3', 'sl'];
const ENTRY_TYPES = ['buy', 'sell'];

/**
 * Parse a raw SFX Algo JSON body into structured fields.
 * Returns null if the body is not valid SFX JSON.
 */
export function parseSfxAlgoAlert(rawBody: string): ParsedSfxAlert | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (data.algorithm !== 'SFX') return null;

  const alertType = String(data.alert ?? '');
  if (!VALID_ALERT_TYPES.includes(alertType)) return null;

  const ticker = String(data.ticker ?? '');
  if (!ticker) return null;

  const isEntry = ENTRY_TYPES.includes(alertType);

  return {
    ticker,
    symbol: normalizeSymbol(ticker),
    alertType,
    signalDirection: String(data.signal_direction ?? ''),
    price: Number(data.close) || 0,
    currentRating: isEntry && data.current_rating != null ? Number(data.current_rating) : null,
    tp1: isEntry && data.tp1 != null ? Number(data.tp1) : null,
    tp2: isEntry && data.tp2 != null ? Number(data.tp2) : null,
    tp3: isEntry && data.tp3 != null ? Number(data.tp3) : null,
    stopLoss: isEntry && data.sl != null ? Number(data.sl) : null,
    entryPrice: !isEntry && data.entry_price != null ? Number(data.entry_price) : null,
    unixTime: Number(data.unix_time) || 0,
  };
}
