// Smart Entry Calculator — Pure function
// Given VPVR result + trade action → compute entry, SL, and TP levels

import type { VPVRResult } from '../services/vpvr/types';
import type { TradeAction } from '../types/database';
import type { EntryCalcResult } from './types';

/** Default SL offset as a fraction of the value area range */
const SL_OFFSET_FRACTION = 0.25;

/**
 * Calculate entry price, SL, and TP levels from VPVR data.
 *
 * BUY (Long):
 *   Entry: VAL (buy at discount)
 *   TP1: POC, TP2: VAH, TP3: Range High
 *   SL: Below VAL
 *
 * SELL (Short):
 *   Entry: VAH (sell at premium)
 *   TP1: POC, TP2: VAL, TP3: Range Low
 *   SL: Above VAH
 */
export function calculateEntry(vpvr: VPVRResult, action: TradeAction): EntryCalcResult {
  if (action !== 'buy' && action !== 'sell') {
    throw new Error(`Invalid action for entry calculation: ${action}. Expected 'buy' or 'sell'.`);
  }

  const vaRange = vpvr.vah - vpvr.val;
  const slOffset = vaRange * SL_OFFSET_FRACTION;

  if (action === 'buy') {
    return {
      side: 'long',
      targetEntryPrice: vpvr.val,
      initialSl: vpvr.val - slOffset,
      tp1Price: vpvr.poc,
      tp2Price: vpvr.vah,
      tp3Price: vpvr.rangeHigh,
    };
  }

  // action === 'sell'
  return {
    side: 'short',
    targetEntryPrice: vpvr.vah,
    initialSl: vpvr.vah + slOffset,
    tp1Price: vpvr.poc,
    tp2Price: vpvr.val,
    tp3Price: vpvr.rangeLow,
  };
}
