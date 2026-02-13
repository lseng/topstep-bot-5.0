// Bot Core Types

import type { PositionSide, PositionState } from '../types/database';
import type { VPVRResult } from '../services/vpvr/types';

/** Bot configuration */
export interface BotConfig {
  accountId: number;
  contractId: string;
  dryRun: boolean;
}

/** In-memory managed position state */
export interface ManagedPosition {
  id: string; // UUID from Supabase
  alertId: string;
  symbol: string;
  side: PositionSide;
  state: PositionState;
  quantity: number;
  contractId: string;
  accountId: number;

  // Order tracking
  entryOrderId: number | null;
  targetEntryPrice: number;
  entryPrice: number | null;

  // TP/SL levels
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  initialSl: number;
  currentSl: number;

  // Live state
  lastPrice: number | null;
  unrealizedPnl: number;

  // VPVR + LLM data
  vpvrData: VPVRResult;
  confirmationScore: number | null;
  llmReasoning: string | null;
  llmConfidence: number | null;

  // Timestamps
  createdAt: Date;
  exitPrice: number | null;
  exitReason: string | null;
  closedAt: Date | null;

  // Dirty tracking for Supabase write queue
  dirty: boolean;
}

/** Result of entry price calculation */
export interface EntryCalcResult {
  targetEntryPrice: number;
  initialSl: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  side: PositionSide;
}

/** Result of trailing stop evaluation */
export interface TrailingStopResult {
  newState: PositionState;
  newSl: number;
  slBreached: boolean;
  tpHit: 'tp1' | 'tp2' | 'tp3' | null;
}

/** Position lifecycle events */
export type PositionEvent =
  | { type: 'opened'; positionId: string }
  | { type: 'filled'; positionId: string; fillPrice: number }
  | { type: 'tp_hit'; positionId: string; level: 'tp1' | 'tp2' | 'tp3'; newSl: number }
  | { type: 'sl_breached'; positionId: string; price: number }
  | { type: 'closed'; positionId: string; reason: string; exitPrice: number }
  | { type: 'cancelled'; positionId: string; reason: string };
