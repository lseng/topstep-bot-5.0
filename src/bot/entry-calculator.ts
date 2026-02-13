// Entry calculator — pure function to compute entry price and TP/SL from VPVR levels

import type { VpvrResult } from '../services/vpvr/types';
import type { TradeAction } from '../types';

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

/**
 * Calculate optimal entry price, TP levels, and initial SL from VPVR analysis.
 *
 * SL is mirrored from the TP1 distance — the distance from entry to POC is
 * applied equally in the opposite direction. This gives a 1:1 risk-reward
 * to TP1 and prevents premature stop-outs.
 *
 * BUY (long):  entry=VAL, SL=VAL-(POC-VAL), TP1=POC, TP2=VAH, TP3=rangeHigh
 * SELL (short): entry=VAH, SL=VAH+(VAH-POC), TP1=POC, TP2=VAL, TP3=rangeLow
 *
 * Close actions return null (no entry to calculate).
 */
export function calculateEntryPrice(
  action: TradeAction,
  vpvr: VpvrResult,
): EntryCalculation | null {
  if (action === 'close' || action === 'close_long' || action === 'close_short') {
    return null;
  }

  if (action === 'buy') {
    // Mirror TP1 distance below entry: SL = entry - (TP1 - entry)
    const tp1Distance = vpvr.poc - vpvr.val;
    return {
      entryPrice: vpvr.val,
      initialSl: vpvr.val - tp1Distance,
      tp1: vpvr.poc,
      tp2: vpvr.vah,
      tp3: vpvr.rangeHigh,
    };
  }

  // action === 'sell'
  // Mirror TP1 distance above entry: SL = entry + (entry - TP1)
  const tp1Distance = vpvr.vah - vpvr.poc;
  return {
    entryPrice: vpvr.vah,
    initialSl: vpvr.vah + tp1Distance,
    tp1: vpvr.poc,
    tp2: vpvr.val,
    tp3: vpvr.rangeLow,
  };
}
