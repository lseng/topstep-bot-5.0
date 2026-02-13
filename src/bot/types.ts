// Bot types — position state machine, managed positions, config

import type { VpvrResult } from '../services/vpvr/types';

/** Position state enum matching DB position_state */
export type PositionState =
  | 'pending_entry'
  | 'active'
  | 'tp1_hit'
  | 'tp2_hit'
  | 'tp3_hit'
  | 'closed'
  | 'cancelled'
  | 'pending_retry';

/** Position side matching DB position_side */
export type PositionSide = 'long' | 'short';

/** In-memory managed position with VPVR levels and TP/SL prices */
export interface ManagedPosition {
  /** Unique ID (matches DB positions.id) */
  id: string;
  /** Alert that triggered this position */
  alertId: string;
  /** Trading symbol (e.g. 'ES', 'NQ') */
  symbol: string;
  /** Long or short */
  side: PositionSide;
  /** Current state in the position lifecycle */
  state: PositionState;
  /** TopstepX order ID for the limit entry */
  entryOrderId?: number;
  /** Actual fill price (set on fill) */
  entryPrice?: number;
  /** Target entry price from VPVR (VAL for long, VAH for short) */
  targetEntryPrice: number;
  /** Number of contracts */
  quantity: number;
  /** TopstepX contract ID */
  contractId: string;
  /** TopstepX account ID */
  accountId: number;
  /** Current stop loss price (trails as TPs are hit) */
  currentSl: number;
  /** Initial stop loss price */
  initialSl: number;
  /** Take profit 1 — POC */
  tp1Price: number;
  /** Take profit 2 — VAH (long) or VAL (short) */
  tp2Price: number;
  /** Take profit 3 — range high (long) or range low (short) */
  tp3Price: number;
  /** Unrealized P&L in dollars */
  unrealizedPnl: number;
  /** Last known price from market data */
  lastPrice?: number;
  /** VPVR calculation result */
  vpvrData: VpvrResult;
  /** Confirmation engine score (0-100) */
  confirmationScore?: number;
  /** Timestamp when position was created */
  createdAt: Date;
  /** Timestamp when position was last updated */
  updatedAt: Date;
  /** Exit price (set on close) */
  exitPrice?: number;
  /** Reason for close (e.g. 'sl_hit', 'opposing_alert', 'manual') */
  exitReason?: string;
  /** Timestamp when position was closed */
  closedAt?: Date;
  /** LLM trade analysis reasoning */
  llmReasoning?: string;
  /** LLM confidence score (0-1) */
  llmConfidence?: number;
  /** Whether this position has unsaved changes */
  dirty: boolean;
  /** Current retry attempt number (0 = original entry) */
  retryCount: number;
  /** Maximum retry attempts allowed for this signal */
  maxRetries: number;
  /** Alert ID of the original signal (links retries back to the first alert) */
  originalAlertId: string;
  /** Pre-calculated stepped entry levels for retries */
  retryEntryLevels: number[];
}

/** Bot configuration */
export interface BotConfig {
  /** TopstepX account ID to trade on */
  accountId: number;
  /** TopstepX contract IDs keyed by symbol (e.g. { MES: 'CON.F.US.MES.H26' }) */
  contractIds: Map<string, string>;
  /** If true, log orders but don't execute via API */
  dryRun: boolean;
  /** Interval in ms to flush dirty positions to Supabase (default: 5000) */
  writeIntervalMs: number;
  /** Trading symbols (e.g. ['MES', 'MNQ', 'MYM']) */
  symbols: string[];
  /** Number of contracts per trade (default: 1) */
  quantity: number;
  /** Maximum contracts allowed across all symbols in micro-equivalent units (default: 30) */
  maxContracts: number;
  /** Maximum re-entry attempts per signal after SL hit (default: 3) */
  maxRetries: number;
  /** Fixed stop-loss buffer in ticks (default: 8) */
  slBufferTicks: number;
}

/** Result of a completed trade, used for logging */
export interface TradeResult {
  /** Position ID from the managed position */
  positionId: string;
  /** Alert ID that triggered the position */
  alertId: string;
  /** Trading symbol */
  symbol: string;
  /** Long or short */
  side: PositionSide;
  /** Entry fill price */
  entryPrice: number;
  /** Timestamp of entry fill */
  entryTime: Date;
  /** Exit price */
  exitPrice: number;
  /** Timestamp of exit */
  exitTime: Date;
  /** Reason for exit (e.g. 'sl_hit', 'tp3_hit', 'opposing_alert') */
  exitReason: string;
  /** Number of contracts */
  quantity: number;
  /** Gross P&L before fees */
  grossPnl: number;
  /** Trading fees */
  fees: number;
  /** Net P&L after fees */
  netPnl: number;
  /** VPVR POC level */
  vpvrPoc: number;
  /** VPVR VAH level */
  vpvrVah: number;
  /** VPVR VAL level */
  vpvrVal: number;
  /** Highest TP level hit (e.g. 'tp1', 'tp2', 'tp3', or null) */
  highestTpHit: string | null;
  /** Confirmation engine score */
  confirmationScore?: number;
  /** LLM reasoning text */
  llmReasoning?: string;
  /** Retry attempt number (0 = original entry) */
  retryCount: number;
  /** Original alert ID that started this signal chain */
  originalAlertId: string;
}

/** Tick data from SignalR quote events */
export interface TickData {
  /** Last trade price */
  price: number;
  /** Timestamp of the tick */
  timestamp: Date;
}
