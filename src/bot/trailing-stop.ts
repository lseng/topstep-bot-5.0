// Trailing stop — pure function to evaluate TP/SL progression

import type { ManagedPosition, PositionState } from './types';

/** Result of evaluating a trailing stop tick */
export interface TrailingStopResult {
  /** New position state if a transition occurred */
  newState?: PositionState;
  /** New stop loss price if SL was moved */
  newSl?: number;
  /** Whether the position should be closed (SL breached) */
  shouldClose: boolean;
  /** Reason for close if shouldClose is true */
  closeReason?: string;
}

/**
 * Evaluate trailing stop logic for a managed position at a given price.
 *
 * TP progression (long):
 *   active: price >= TP1 → tp1_hit, SL = entry
 *   tp1_hit: price >= TP2 → tp2_hit, SL = TP1
 *   tp2_hit: price >= TP3 → tp3_hit, SL = TP2
 *   tp3_hit: price >= TP3 + gap → trail SL at (price - gap)
 *
 * TP progression (short):
 *   active: price <= TP1 → tp1_hit, SL = entry
 *   tp1_hit: price <= TP2 → tp2_hit, SL = TP1
 *   tp2_hit: price <= TP3 → tp3_hit, SL = TP2
 *   tp3_hit: price <= TP3 - gap → trail SL at (price + gap)
 *
 * Where gap = abs(TP3 - TP2) — the distance between TP2 and TP3.
 *
 * SL breach:
 *   long: price <= currentSl → close
 *   short: price >= currentSl → close
 *
 * @param position - The managed position to evaluate
 * @param currentPrice - Current market price
 * @returns Trailing stop evaluation result
 */
export function evaluateTrailingStop(
  position: ManagedPosition,
  currentPrice: number,
): TrailingStopResult {
  const { side, state, entryPrice } = position;

  // Only evaluate active positions (active, tp1_hit, tp2_hit, tp3_hit)
  if (state === 'pending_entry' || state === 'closed' || state === 'cancelled' || state === 'pending_retry') {
    return { shouldClose: false };
  }

  const isLong = side === 'long';

  // Check SL breach first (takes priority)
  const slBreached = isLong
    ? currentPrice <= position.currentSl
    : currentPrice >= position.currentSl;

  if (slBreached) {
    return {
      newState: 'closed',
      shouldClose: true,
      closeReason: `sl_hit_from_${state}`,
    };
  }

  // Check TP progression
  if (state === 'active' && entryPrice != null) {
    const tp1Hit = isLong
      ? currentPrice >= position.tp1Price
      : currentPrice <= position.tp1Price;

    if (tp1Hit) {
      return {
        newState: 'tp1_hit',
        newSl: entryPrice, // Move SL to breakeven
        shouldClose: false,
      };
    }
  }

  if (state === 'tp1_hit') {
    const tp2Hit = isLong
      ? currentPrice >= position.tp2Price
      : currentPrice <= position.tp2Price;

    if (tp2Hit) {
      return {
        newState: 'tp2_hit',
        newSl: position.tp1Price, // Move SL to TP1
        shouldClose: false,
      };
    }
  }

  if (state === 'tp2_hit') {
    const tp3Hit = isLong
      ? currentPrice >= position.tp3Price
      : currentPrice <= position.tp3Price;

    if (tp3Hit) {
      return {
        newState: 'tp3_hit',
        newSl: position.tp2Price, // Move SL to TP2
        shouldClose: false,
      };
    }
  }

  // Beyond TP3: trail SL at (TP3-TP2) distance from current price
  if (state === 'tp3_hit') {
    const gap = Math.abs(position.tp3Price - position.tp2Price);

    if (isLong) {
      // Trail SL upward as price rises beyond TP3
      const trailSl = currentPrice - gap;
      if (trailSl > position.currentSl) {
        return {
          newSl: trailSl,
          shouldClose: false,
        };
      }
    } else {
      // Trail SL downward as price falls beyond TP3
      const trailSl = currentPrice + gap;
      if (trailSl < position.currentSl) {
        return {
          newSl: trailSl,
          shouldClose: false,
        };
      }
    }
  }

  // No state change — price is between current levels
  return { shouldClose: false };
}
