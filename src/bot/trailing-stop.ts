// Trailing Stop Logic — Pure function
// Given current position state + current price → determine TP hits and SL changes

import type { PositionState, PositionSide } from '../types/database';
import type { TrailingStopResult } from './types';

interface TrailingStopInput {
  side: PositionSide;
  state: PositionState;
  currentPrice: number;
  entryPrice: number;
  currentSl: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
}

/**
 * Evaluate trailing stop logic for a position.
 *
 * TP Progression (Long):
 *   TP1 hit (price >= TP1) → SL = entry (breakeven)
 *   TP2 hit (price >= TP2) → SL = TP1
 *   TP3 hit (price >= TP3) → SL = TP2
 *
 * TP Progression (Short):
 *   TP1 hit (price <= TP1) → SL = entry (breakeven)
 *   TP2 hit (price <= TP2) → SL = TP1
 *   TP3 hit (price <= TP3) → SL = TP2
 *
 * SL Breach:
 *   Long: price <= currentSl
 *   Short: price >= currentSl
 */
export function evaluateTrailingStop(input: TrailingStopInput): TrailingStopResult {
  const { side, state, currentPrice, entryPrice, currentSl, tp1Price, tp2Price, tp3Price } = input;

  // Only evaluate for active position states
  if (state !== 'active' && state !== 'tp1_hit' && state !== 'tp2_hit' && state !== 'tp3_hit') {
    return { newState: state, newSl: currentSl, slBreached: false, tpHit: null };
  }

  const isLong = side === 'long';

  // Check SL breach first (before TP checks)
  const slBreached = isLong ? currentPrice <= currentSl : currentPrice >= currentSl;
  if (slBreached) {
    return { newState: 'closed', newSl: currentSl, slBreached: true, tpHit: null };
  }

  // Check TP levels in order (TP3 → TP2 → TP1, highest priority first)
  if (state !== 'tp3_hit') {
    const tp3Hit = isLong ? currentPrice >= tp3Price : currentPrice <= tp3Price;
    if (tp3Hit) {
      return { newState: 'tp3_hit', newSl: tp2Price, slBreached: false, tpHit: 'tp3' };
    }
  }

  if (state !== 'tp2_hit' && state !== 'tp3_hit') {
    const tp2Hit = isLong ? currentPrice >= tp2Price : currentPrice <= tp2Price;
    if (tp2Hit) {
      return { newState: 'tp2_hit', newSl: tp1Price, slBreached: false, tpHit: 'tp2' };
    }
  }

  if (state === 'active') {
    const tp1Hit = isLong ? currentPrice >= tp1Price : currentPrice <= tp1Price;
    if (tp1Hit) {
      return { newState: 'tp1_hit', newSl: entryPrice, slBreached: false, tpHit: 'tp1' };
    }
  }

  // No change
  return { newState: state, newSl: currentSl, slBreached: false, tpHit: null };
}
