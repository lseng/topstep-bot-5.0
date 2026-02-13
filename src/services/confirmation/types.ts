// Confirmation engine types

import type { TradeAction } from '../../types';
import type { VpvrResult } from '../vpvr/types';

/** How strongly the VPVR confirms the signal */
export type ConfirmationLevel = 'strong' | 'moderate' | 'weak' | 'reject';

/** VPVR result for a single timeframe */
export interface TimeframeResult {
  /** Timeframe label (e.g. '1M', '5M') */
  timeframe: string;
  /** The VPVR calculation result */
  vpvr: VpvrResult;
  /** Where the current price sits relative to value area */
  level: ConfirmationLevel;
  /** Human-readable reason for the level */
  reason: string;
}

/** Overall confirmation result */
export interface ConfirmationResult {
  /** Whether the signal is confirmed (score >= minScore) */
  confirmed: boolean;
  /** Numeric score 0-100 (100 = strongest confirmation) */
  score: number;
  /** Overall confirmation level */
  level: ConfirmationLevel;
  /** Per-timeframe breakdown */
  timeframes: TimeframeResult[];
  /** Human-readable summary */
  summary: string;
  /** The action that was evaluated */
  action: TradeAction;
  /** The price that was evaluated against the profile */
  price: number;
  /** Timestamp of the confirmation */
  timestamp: string;
}

/** Configuration for the confirmation engine */
export interface ConfirmationConfig {
  /** Number of 1M bars to fetch (default: 60 = 1 hour) */
  bars1M: number;
  /** Number of 5M bars to fetch (default: 60 = 5 hours) */
  bars5M: number;
  /** Number of histogram bins for VPVR (default: 50) */
  numBins: number;
  /** Minimum score to confirm (default: 50) */
  minScore: number;
}
