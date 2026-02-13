// VPVR (Volume Profile Visible Range) Types

/** OHLCV bar data for VPVR calculation */
export interface VPVRBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Configuration for VPVR calculation */
export interface VPVRConfig {
  /** Number of price bins for the volume profile (default: 100) */
  numBins?: number;
  /** Value area percentage (default: 70) — the percentage of total volume within the value area */
  valueAreaPercent?: number;
}

/** Single volume profile bin */
export interface ProfileBin {
  priceLevel: number;
  volume: number;
}

/** Result of VPVR calculation */
export interface VPVRResult {
  /** Point of Control — price level with the highest volume */
  poc: number;
  /** Value Area High — upper bound of the value area */
  vah: number;
  /** Value Area Low — lower bound of the value area */
  val: number;
  /** Highest price in the range */
  rangeHigh: number;
  /** Lowest price in the range */
  rangeLow: number;
  /** Volume profile bins (price → volume) */
  profileBins: ProfileBin[];
  /** Total volume in the range */
  totalVolume: number;
}
