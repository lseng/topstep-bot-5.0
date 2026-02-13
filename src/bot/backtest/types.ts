// Backtest Engine Types

import type { PositionSide } from '../../types/database';

/** Configuration for backtest runs */
export interface BacktestConfig {
  symbol?: string;
  fromDate?: string; // ISO date
  toDate?: string; // ISO date
  contractId: string;
}

/** A single simulated trade result */
export interface SimulatedTrade {
  alertId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  exitReason: string;
  quantity: number;
  grossPnl: number;
  highestTpHit: string | null; // 'tp1', 'tp2', 'tp3', or null
  vpvrPoc: number;
  vpvrVah: number;
  vpvrVal: number;
}

/** Aggregated backtest results */
export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0-100 percentage
  avgPnl: number;
  totalPnl: number;
  profitFactor: number; // total wins / total losses
  largestWin: number;
  largestLoss: number;
  trades: SimulatedTrade[];
}
