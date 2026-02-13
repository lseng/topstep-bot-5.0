// Entry calculator — pure function to compute entry price and TP/SL from VPVR levels

import type { VpvrResult } from '../services/vpvr/types';
import type { TradeAction } from '../types';
import type { PositionSide } from './types';
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

/** Options for SL calculation */
export interface EntryCalculationOptions {
  /** Symbol for tick size lookup (used with slBufferTicks) */
  symbol?: string;
  /** Fixed SL buffer in ticks. When > 0, overrides mirrored TP1 SL. */
  slBufferTicks?: number;
}

/**
 * Calculate optimal entry price, TP levels, and initial SL from VPVR analysis.
 *
 * SL modes:
 *   - slBufferTicks > 0: SL = entry +/- (slBufferTicks * tickSize)
 *   - slBufferTicks === 0 or unset: SL mirrors TP1 distance (legacy behavior)
 *
 * BUY (long):  entry=VAL, TP1=POC, TP2=VAH, TP3=rangeHigh
 * SELL (short): entry=VAH, TP1=POC, TP2=VAL, TP3=rangeLow
 *
 * Close actions return null (no entry to calculate).
 */
export function calculateEntryPrice(
  action: TradeAction,
  vpvr: VpvrResult,
  options?: EntryCalculationOptions,
): EntryCalculation | null {
  if (action === 'close' || action === 'close_long' || action === 'close_short') {
    return null;
  }

  const slBufferTicks = options?.slBufferTicks ?? 0;
  const symbol = options?.symbol ?? 'ES';
  const tickSize = CONTRACT_SPECS[symbol]?.tickSize ?? 0.25;

  if (action === 'buy') {
    const initialSl = slBufferTicks > 0
      ? vpvr.val - slBufferTicks * tickSize
      : vpvr.val - (vpvr.poc - vpvr.val); // Mirror TP1 distance

    return {
      entryPrice: vpvr.val,
      initialSl,
      tp1: vpvr.poc,
      tp2: vpvr.vah,
      tp3: vpvr.rangeHigh,
    };
  }

  // action === 'sell'
  const initialSl = slBufferTicks > 0
    ? vpvr.vah + slBufferTicks * tickSize
    : vpvr.vah + (vpvr.vah - vpvr.poc); // Mirror TP1 distance

  return {
    entryPrice: vpvr.vah,
    initialSl,
    tp1: vpvr.poc,
    tp2: vpvr.val,
    tp3: vpvr.rangeLow,
  };
}

/**
 * Calculate SL from a given entry price using the tick buffer method.
 *
 * @param entryPrice - The fill price
 * @param side - Long or short
 * @param symbol - Symbol for tick size lookup
 * @param slBufferTicks - Number of ticks for SL buffer
 * @returns The SL price
 */
export function calculateSlFromEntry(
  entryPrice: number,
  side: PositionSide,
  symbol: string,
  slBufferTicks: number,
): number {
  const tickSize = CONTRACT_SPECS[symbol]?.tickSize ?? 0.25;
  return side === 'long'
    ? entryPrice - slBufferTicks * tickSize
    : entryPrice + slBufferTicks * tickSize;
}

/**
 * Calculate stepped re-entry levels based on VPVR data.
 *
 * Long ladder:
 *   Attempt 0 (original): VAL
 *   Attempt 1: rangeLow
 *   Attempt 2: rangeLow - (VAL - rangeLow)
 *
 * Short ladder:
 *   Attempt 0 (original): VAH
 *   Attempt 1: rangeHigh
 *   Attempt 2: rangeHigh + (rangeHigh - VAH)
 *
 * @param side - Long or short
 * @param vpvr - VPVR result with value area and range levels
 * @param maxRetries - Maximum number of retries (determines ladder size)
 * @returns Array of entry prices indexed by retry attempt (index 0 = original)
 */
export function calculateRetryEntryLevels(
  side: PositionSide,
  vpvr: VpvrResult,
  maxRetries: number,
): number[] {
  const levels: number[] = [];

  if (side === 'long') {
    // Attempt 0: VAL (original entry)
    levels.push(vpvr.val);
    if (maxRetries >= 1) {
      // Attempt 1: rangeLow
      levels.push(vpvr.rangeLow);
    }
    if (maxRetries >= 2) {
      // Attempt 2: rangeLow - (VAL - rangeLow), mirrored below rangeLow
      levels.push(vpvr.rangeLow - (vpvr.val - vpvr.rangeLow));
    }
    // Additional retries beyond 3 just repeat the last level
    for (let i = 3; i <= maxRetries; i++) {
      levels.push(levels[levels.length - 1]);
    }
  } else {
    // Attempt 0: VAH (original entry)
    levels.push(vpvr.vah);
    if (maxRetries >= 1) {
      // Attempt 1: rangeHigh
      levels.push(vpvr.rangeHigh);
    }
    if (maxRetries >= 2) {
      // Attempt 2: rangeHigh + (rangeHigh - VAH), mirrored above rangeHigh
      levels.push(vpvr.rangeHigh + (vpvr.rangeHigh - vpvr.vah));
    }
    // Additional retries beyond 3 just repeat the last level
    for (let i = 3; i <= maxRetries; i++) {
      levels.push(levels[levels.length - 1]);
    }
  }

  return levels;
}
