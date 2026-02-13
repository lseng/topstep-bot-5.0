// Entry calculator — pure function to compute entry price and TP/SL from VPVR levels

import type { VpvrResult } from '../services/vpvr/types';
import type { TradeAction } from '../types';
import { CONTRACT_SPECS } from '../services/topstepx/types';

/** Entry calculation result with all price levels */
export interface EntryCalculation {
  /** Limit order entry price (VAL for buy, VAH for sell) */
  entryPrice: number;
  /** Initial stop loss price */
  initialSl: number;
  /** Take profit 1 — POC */
  tp1: number;
  /** Take profit 2 — opposite value area boundary */
  tp2: number;
  /** Take profit 3 — range extreme */
  tp3: number;
}

/** Configuration for entry calculation */
export interface EntryCalcConfig {
  /** Number of ticks below/above entry for initial SL (default: 8) */
  slBufferTicks?: number;
  /** Symbol for looking up tick size (default: 'ES') */
  symbol?: string;
}

/**
 * Calculate optimal entry price, TP levels, and initial SL from VPVR analysis.
 *
 * BUY (long):  entry=VAL, SL=below VAL, TP1=POC, TP2=VAH, TP3=rangeHigh
 * SELL (short): entry=VAH, SL=above VAH, TP1=POC, TP2=VAL, TP3=rangeLow
 *
 * Close actions return null (no entry to calculate).
 *
 * @param action - Trade action (buy, sell, close, close_long, close_short)
 * @param vpvr - VPVR calculation result with POC, VAH, VAL, range
 * @param config - Optional config for SL buffer and symbol tick size
 * @returns Entry calculation or null for close actions
 */
export function calculateEntryPrice(
  action: TradeAction,
  vpvr: VpvrResult,
  config?: EntryCalcConfig,
): EntryCalculation | null {
  if (action === 'close' || action === 'close_long' || action === 'close_short') {
    return null;
  }

  const slBufferTicks = config?.slBufferTicks ?? 8;
  const symbol = config?.symbol ?? 'ES';
  const tickSize = CONTRACT_SPECS[symbol]?.tickSize ?? 0.25;
  const slBuffer = slBufferTicks * tickSize;

  if (action === 'buy') {
    return {
      entryPrice: vpvr.val,
      initialSl: vpvr.val - slBuffer,
      tp1: vpvr.poc,
      tp2: vpvr.vah,
      tp3: vpvr.rangeHigh,
    };
  }

  // action === 'sell'
  return {
    entryPrice: vpvr.vah,
    initialSl: vpvr.vah + slBuffer,
    tp1: vpvr.poc,
    tp2: vpvr.val,
    tp3: vpvr.rangeLow,
  };
}
