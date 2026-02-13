// VPVR (Volume Profile Visible Range) types
// Ported from Fr3d0's Pine Script indicator

import type { Bar } from '../topstepx/types';

/** Configuration for VPVR calculation */
export interface VpvrConfig {
  /** Number of histogram bins to divide the price range into */
  numBins: number;
}

/** A single bin in the volume profile histogram */
export interface VpvrBin {
  /** Lower price boundary of this bin */
  priceLow: number;
  /** Upper price boundary of this bin */
  priceHigh: number;
  /** Midpoint price of this bin */
  priceMid: number;
  /** Total volume in this bin (buy + sell) */
  totalVolume: number;
  /** Buy volume: volume * (close - low) / (high - low) per bar */
  buyVolume: number;
  /** Sell volume: volume * (high - close) / (high - low) per bar */
  sellVolume: number;
}

/** Result of a VPVR calculation */
export interface VpvrResult {
  /** All histogram bins, ordered from lowest to highest price */
  bins: VpvrBin[];
  /** Point of Control — price level (bin midpoint) with highest total volume */
  poc: number;
  /** Value Area High — upper boundary of the 70% value area */
  vah: number;
  /** Value Area Low — lower boundary of the 70% value area */
  val: number;
  /** Total volume across all bins */
  totalVolume: number;
  /** Highest price in the range (from bar highs) */
  rangeHigh: number;
  /** Lowest price in the range (from bar lows) */
  rangeLow: number;
  /** Number of bars used in the calculation */
  barCount: number;
}

// Re-export Bar for convenience
export type { Bar };
