// Backtest types — configuration, simulation results, reporting

import type { PositionSide } from '../types';

/** Configuration for a backtest run */
export interface BacktestConfig {
  /** Start date for fetching alerts (ISO 8601) */
  fromDate: string;
  /** End date for fetching alerts (ISO 8601) */
  toDate: string;
  /** Trading symbols to filter alerts (e.g. ['MES', 'MNQ']) */
  symbols: string[];
  /** Number of contracts per trade (default: 1) */
  quantity: number;
  /** Whether to print verbose per-trade output */
  verbose: boolean;
  /** Maximum contracts allowed across all symbols in micro-equivalent units (default: 30). 0 = unlimited. */
  maxContracts: number;
  /** Maximum re-entry attempts per signal after SL hit (default: 0 = no retries) */
  maxRetries: number;
  /** Fixed stop-loss buffer in ticks (default: 0 = use mirrored TP1) */
  slBufferTicks: number;
}

/** A single simulated trade from the backtest */
export interface SimulatedTrade {
  /** Alert ID that triggered this trade */
  alertId: string;
  /** Trading symbol */
  symbol: string;
  /** Long or short */
  side: PositionSide;
  /** Entry fill price (VAL for long, VAH for short) */
  entryPrice: number;
  /** Timestamp of simulated entry fill */
  entryTime: Date;
  /** Exit price */
  exitPrice: number;
  /** Timestamp of simulated exit */
  exitTime: Date;
  /** Reason for exit (e.g. 'sl_hit', 'tp3_hit') */
  exitReason: string;
  /** Highest TP level reached during the trade */
  highestTpHit: string | null;
  /** TP progression: which TP levels were hit in order */
  tpProgression: string[];
  /** Gross P&L before fees */
  grossPnl: number;
  /** Net P&L after fees */
  netPnl: number;
  /** VPVR POC level used */
  vpvrPoc: number;
  /** VPVR VAH level used */
  vpvrVah: number;
  /** VPVR VAL level used */
  vpvrVal: number;
  /** Whether the entry price was reached (fill simulated) */
  entryFilled: boolean;
  /** Retry attempt number (0 = original entry) */
  retryCount: number;
  /** Original alert ID that started this signal chain */
  originalAlertId: string;
}

/** Aggregated backtest result */
export interface BacktestResult {
  /** Configuration used for this run */
  config: BacktestConfig;
  /** Total number of alerts evaluated */
  alertsEvaluated: number;
  /** Number of trades that had entry fills */
  tradesTaken: number;
  /** Number of winning trades (net_pnl > 0) */
  wins: number;
  /** Number of losing trades (net_pnl <= 0) */
  losses: number;
  /** Win rate as a percentage (0-100) */
  winRate: number;
  /** Total gross P&L across all trades */
  totalGrossPnl: number;
  /** Total net P&L across all trades */
  totalNetPnl: number;
  /** Average net P&L per trade */
  avgNetPnl: number;
  /** Profit factor: gross wins / gross losses (Infinity if no losses) */
  profitFactor: number;
  /** Annualized Sharpe ratio */
  sharpeRatio: number;
  /** Maximum peak-to-trough drawdown */
  maxDrawdown: number;
  /** Per-trade breakdown */
  trades: SimulatedTrade[];
  /** Number of alerts skipped due to capacity limits */
  alertsSkipped: number;
  /** Number of times capacity was exceeded */
  capacityExceeded: number;
}
