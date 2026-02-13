// VPVR Calculator — Volume Profile Visible Range
// Pure function: takes OHLCV bars → computes volume profile → returns POC, VAH, VAL

import type { VPVRBar, VPVRConfig, VPVRResult, ProfileBin } from './types';

const DEFAULT_NUM_BINS = 100;
const DEFAULT_VALUE_AREA_PERCENT = 70;

/**
 * Calculate VPVR from an array of OHLCV bars.
 * Distributes each bar's volume across the price bins it spans,
 * then finds POC, VAH, and VAL from the value area.
 */
export function calculateVPVR(bars: VPVRBar[], config?: VPVRConfig): VPVRResult {
  if (bars.length === 0) {
    throw new Error('Cannot calculate VPVR with empty bars');
  }

  const numBins = config?.numBins ?? DEFAULT_NUM_BINS;
  const valueAreaPercent = config?.valueAreaPercent ?? DEFAULT_VALUE_AREA_PERCENT;

  // Find price range
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (const bar of bars) {
    if (bar.high > rangeHigh) rangeHigh = bar.high;
    if (bar.low < rangeLow) rangeLow = bar.low;
  }

  // Handle single-price edge case
  if (rangeHigh === rangeLow) {
    const totalVol = bars.reduce((sum, b) => sum + b.volume, 0);
    return {
      poc: rangeHigh,
      vah: rangeHigh,
      val: rangeLow,
      rangeHigh,
      rangeLow,
      profileBins: [{ priceLevel: rangeHigh, volume: totalVol }],
      totalVolume: totalVol,
    };
  }

  const binSize = (rangeHigh - rangeLow) / numBins;

  // Initialize bins
  const bins: ProfileBin[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      priceLevel: rangeLow + binSize * (i + 0.5), // midpoint of bin
      volume: 0,
    });
  }

  // Distribute each bar's volume across the bins it spans
  let totalVolume = 0;
  for (const bar of bars) {
    const barLow = Math.min(bar.open, bar.close, bar.low);
    const barHigh = Math.max(bar.open, bar.close, bar.high);
    const vol = bar.volume;

    // Find which bins this bar spans
    const startBin = Math.max(0, Math.floor((barLow - rangeLow) / binSize));
    const endBin = Math.min(numBins - 1, Math.floor((barHigh - rangeLow) / binSize));
    const numSpannedBins = endBin - startBin + 1;

    if (numSpannedBins > 0) {
      const volPerBin = vol / numSpannedBins;
      for (let i = startBin; i <= endBin; i++) {
        bins[i].volume += volPerBin;
      }
    }

    totalVolume += vol;
  }

  // Find POC (bin with highest volume)
  let pocIndex = 0;
  let maxVol = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].volume > maxVol) {
      maxVol = bins[i].volume;
      pocIndex = i;
    }
  }
  const poc = bins[pocIndex].priceLevel;

  // Calculate Value Area — expand outward from POC until we reach target %
  const targetVolume = totalVolume * (valueAreaPercent / 100);
  let vaVolume = bins[pocIndex].volume;
  let vaLowIndex = pocIndex;
  let vaHighIndex = pocIndex;

  while (vaVolume < targetVolume && (vaLowIndex > 0 || vaHighIndex < numBins - 1)) {
    const canGoLow = vaLowIndex > 0;
    const canGoHigh = vaHighIndex < numBins - 1;

    if (canGoLow && canGoHigh) {
      // Expand toward whichever side has more volume
      if (bins[vaLowIndex - 1].volume >= bins[vaHighIndex + 1].volume) {
        vaLowIndex--;
        vaVolume += bins[vaLowIndex].volume;
      } else {
        vaHighIndex++;
        vaVolume += bins[vaHighIndex].volume;
      }
    } else if (canGoLow) {
      vaLowIndex--;
      vaVolume += bins[vaLowIndex].volume;
    } else {
      vaHighIndex++;
      vaVolume += bins[vaHighIndex].volume;
    }
  }

  const val = bins[vaLowIndex].priceLevel - binSize / 2; // bottom edge of the bin
  const vah = bins[vaHighIndex].priceLevel + binSize / 2; // top edge of the bin

  return {
    poc,
    vah,
    val,
    rangeHigh,
    rangeLow,
    profileBins: bins,
    totalVolume,
  };
}
