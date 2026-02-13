// Confirmation Engine — Dual-timeframe (1M+5M) VPVR confirmation scoring
// Pure function: takes 1M and 5M VPVR results → produces confirmation score

import type { VPVRResult } from '../vpvr/types';
import type { ConfirmationConfig, ConfirmationResult, ConfirmationBreakdown } from './types';

/**
 * Calculate how aligned two price levels are, returning a score 0-100.
 * 100 = perfectly aligned, 0 = completely misaligned.
 */
function alignmentScore(level1: number, level2: number, range: number): number {
  if (range === 0) return 100;
  const distance = Math.abs(level1 - level2);
  const normalized = distance / range;
  // Linear decay: 100 at 0 distance, 0 at threshold or beyond
  return Math.max(0, Math.round((1 - normalized / 0.1) * 100));
}

/**
 * Calculate the overlap between two value areas as a percentage.
 */
function valueAreaOverlapScore(
  val1: number, vah1: number,
  val2: number, vah2: number,
): number {
  const overlapLow = Math.max(val1, val2);
  const overlapHigh = Math.min(vah1, vah2);
  const overlap = Math.max(0, overlapHigh - overlapLow);

  const totalRange = Math.max(vah1, vah2) - Math.min(val1, val2);
  if (totalRange === 0) return 100;

  return Math.round((overlap / totalRange) * 100);
}

/**
 * Compute dual-timeframe VPVR confirmation score.
 * Takes 1-minute and 5-minute VPVR results and scores their alignment.
 */
export function confirmVPVR(
  vpvr1M: VPVRResult,
  vpvr5M: VPVRResult,
  _config?: ConfirmationConfig,
): ConfirmationResult {
  // Use the combined range for alignment scoring
  const combinedRange = Math.max(vpvr1M.rangeHigh, vpvr5M.rangeHigh) -
    Math.min(vpvr1M.rangeLow, vpvr5M.rangeLow);

  const breakdown: ConfirmationBreakdown = {
    pocAlignment: alignmentScore(vpvr1M.poc, vpvr5M.poc, combinedRange),
    vahAlignment: alignmentScore(vpvr1M.vah, vpvr5M.vah, combinedRange),
    valAlignment: alignmentScore(vpvr1M.val, vpvr5M.val, combinedRange),
    valueAreaOverlap: valueAreaOverlapScore(vpvr1M.val, vpvr1M.vah, vpvr5M.val, vpvr5M.vah),
  };

  // Weighted overall score — POC alignment is most important
  const rawScore =
    breakdown.pocAlignment * 0.35 +
    breakdown.vahAlignment * 0.2 +
    breakdown.valAlignment * 0.2 +
    breakdown.valueAreaOverlap * 0.25;

  const score = Math.round(rawScore);

  return {
    score,
    breakdown,
    vpvr1M,
    vpvr5M,
  };
}
