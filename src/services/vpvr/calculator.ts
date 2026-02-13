// VPVR Calculator — pure math, no I/O
// Exact port of Fr3d0's Volume Profile Visible Range Pine Script algorithm

import type { Bar } from '../topstepx/types';
import type { VpvrConfig, VpvrBin, VpvrResult } from './types';

/** Default VPVR configuration */
export const DEFAULT_VPVR_CONFIG: VpvrConfig = { numBins: 50 };

/**
 * Calculate VPVR (Volume Profile Visible Range) from OHLCV bars.
 *
 * Algorithm (from Fr3d0's Pine Script):
 * 1. Find rangeHigh (max of all highs) and rangeLow (min of all lows)
 * 2. Divide into numBins equal-height bins
 * 3. For each bar, split volume into buy/sell and distribute across overlapping bins
 * 4. POC = bin with highest total volume
 * 5. Value Area = expand from POC outward until 70% of total volume captured
 *
 * @returns VpvrResult or null if bars are empty/invalid
 */
export function calculateVpvr(
  bars: Bar[],
  config?: Partial<VpvrConfig>,
): VpvrResult | null {
  if (bars.length === 0) {
    return null;
  }

  const numBins = config?.numBins ?? DEFAULT_VPVR_CONFIG.numBins;

  // Step 1: Find range
  let rangeHigh = bars[0].h;
  let rangeLow = bars[0].l;
  for (const bar of bars) {
    if (bar.h > rangeHigh) rangeHigh = bar.h;
    if (bar.l < rangeLow) rangeLow = bar.l;
  }

  const rangeHeight = rangeHigh - rangeLow;

  // Edge case: all bars at same price
  if (rangeHeight === 0) {
    let totalVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    for (const bar of bars) {
      totalVolume += bar.v;
      buyVolume += bar.v * 0.5;
      sellVolume += bar.v * 0.5;
    }
    const bin: VpvrBin = {
      priceLow: rangeLow,
      priceHigh: rangeHigh,
      priceMid: rangeLow,
      totalVolume,
      buyVolume,
      sellVolume,
    };
    return {
      bins: [bin],
      poc: rangeLow,
      vah: rangeHigh,
      val: rangeLow,
      totalVolume,
      rangeHigh,
      rangeLow,
      barCount: bars.length,
    };
  }

  // Step 2: Create bins
  const binHeight = rangeHeight / numBins;
  const binBuyVolumes = new Float64Array(numBins);
  const binSellVolumes = new Float64Array(numBins);
  const binLows = new Float64Array(numBins);
  const binHighs = new Float64Array(numBins);

  for (let i = 0; i < numBins; i++) {
    binLows[i] = rangeLow + binHeight * i;
    binHighs[i] = rangeLow + binHeight * (i + 1);
  }

  // Step 3: Distribute volume across bins
  let totalVolume = 0;
  for (const bar of bars) {
    totalVolume += bar.v;
    const barHeight = bar.h - bar.l;

    let barBuyVol: number;
    let barSellVol: number;
    if (barHeight === 0) {
      // Doji: split 50/50
      barBuyVol = bar.v * 0.5;
      barSellVol = bar.v * 0.5;
    } else {
      barBuyVol = bar.v * (bar.c - bar.l) / barHeight;
      barSellVol = bar.v * (bar.h - bar.c) / barHeight;
    }

    for (let j = 0; j < numBins; j++) {
      // Calculate overlap between bar range and bin range
      const overlapLow = Math.max(binLows[j], bar.l);
      const overlapHigh = Math.min(binHighs[j], bar.h);
      const overlap = overlapHigh - overlapLow;

      if (overlap > 0) {
        const fraction = barHeight === 0 ? 1 : overlap / barHeight;
        binBuyVolumes[j] += barBuyVol * fraction;
        binSellVolumes[j] += barSellVol * fraction;
      }
    }
  }

  // Step 4: Find POC (bin with highest total volume)
  let highestVolume = 0;
  let pocIndex = 0;
  for (let i = 0; i < numBins; i++) {
    const binTotal = binBuyVolumes[i] + binSellVolumes[i];
    if (binTotal > highestVolume) {
      highestVolume = binTotal;
      pocIndex = i;
    }
  }

  const poc = (binLows[pocIndex] + binHighs[pocIndex]) / 2;

  // Step 5: Value Area — expand from POC until 70% of total volume
  const valueAreaTarget = totalVolume * 0.7;
  let volumeAccum = binBuyVolumes[pocIndex] + binSellVolumes[pocIndex];
  let upIndex = pocIndex + 1;
  let downIndex = pocIndex - 1;
  let vahIndex = pocIndex;
  let valIndex = pocIndex;

  while (volumeAccum < valueAreaTarget) {
    const canGoUp = upIndex < numBins;
    const canGoDown = downIndex >= 0;

    if (!canGoUp && !canGoDown) break;

    const volUp = canGoUp ? binBuyVolumes[upIndex] + binSellVolumes[upIndex] : 0;
    const volDown = canGoDown ? binBuyVolumes[downIndex] + binSellVolumes[downIndex] : 0;

    if (canGoUp && (!canGoDown || volUp >= volDown)) {
      vahIndex = upIndex;
      volumeAccum += volUp;
      upIndex++;
    } else if (canGoDown) {
      valIndex = downIndex;
      volumeAccum += volDown;
      downIndex--;
    }
  }

  const vah = (binLows[vahIndex] + binHighs[vahIndex]) / 2;
  const val = (binLows[valIndex] + binHighs[valIndex]) / 2;

  // Build result bins
  const bins: VpvrBin[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      priceLow: binLows[i],
      priceHigh: binHighs[i],
      priceMid: (binLows[i] + binHighs[i]) / 2,
      totalVolume: binBuyVolumes[i] + binSellVolumes[i],
      buyVolume: binBuyVolumes[i],
      sellVolume: binSellVolumes[i],
    });
  }

  return {
    bins,
    poc,
    vah,
    val,
    totalVolume,
    rangeHigh,
    rangeLow,
    barCount: bars.length,
  };
}
