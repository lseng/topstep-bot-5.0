// Confirmation Engine Types — Dual-timeframe VPVR confirmation scoring

import type { VPVRResult } from '../vpvr/types';

/** Configuration for the confirmation engine */
export interface ConfirmationConfig {
  /** Weight for 1M timeframe alignment (0-1, default: 0.4) */
  weight1M?: number;
  /** Weight for 5M timeframe alignment (0-1, default: 0.6) */
  weight5M?: number;
  /** Maximum allowed distance (as fraction of range) for levels to be considered aligned (default: 0.05) */
  alignmentThreshold?: number;
}

/** Breakdown of confirmation scoring per component */
export interface ConfirmationBreakdown {
  /** POC alignment score (0-100) */
  pocAlignment: number;
  /** VAH alignment score (0-100) */
  vahAlignment: number;
  /** VAL alignment score (0-100) */
  valAlignment: number;
  /** Value area overlap score (0-100) */
  valueAreaOverlap: number;
}

/** Result of the confirmation analysis */
export interface ConfirmationResult {
  /** Overall confirmation score (0-100) */
  score: number;
  /** Score breakdown per component */
  breakdown: ConfirmationBreakdown;
  /** VPVR result for the 1M timeframe */
  vpvr1M: VPVRResult;
  /** VPVR result for the 5M timeframe */
  vpvr5M: VPVRResult;
}
