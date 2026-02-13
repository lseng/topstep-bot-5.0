// Supabase write queue — 5-second flush interval with dirty flag pattern

import { logger } from '../lib/logger';
import { getSupabase } from '../lib/supabase';
import type { ManagedPosition, TradeResult } from './types';
import type { PositionUpdate, TradesLogInsert } from '../types/database';

/**
 * Rate-limited Supabase write queue.
 *
 * Buffers position updates and flushes every 5 seconds.
 * Only writes positions that have changed (dirty flag pattern).
 * Completed trades are written immediately to trades_log.
 */
export class SupabaseWriteQueue {
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private dirtyPositions = new Map<string, ManagedPosition>();
  private intervalMs: number;

  constructor(intervalMs = 5000) {
    this.intervalMs = intervalMs;
  }

  /** Mark a position as dirty (needs write on next flush) */
  markDirty(position: ManagedPosition): void {
    this.dirtyPositions.set(position.id, position);
  }

  /** Start the flush interval timer */
  start(): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => {
      this.flush().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error('Supabase flush failed', { error: msg });
      });
    }, this.intervalMs);
  }

  /** Stop the flush interval timer */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /** Flush all dirty positions to Supabase */
  async flush(): Promise<number> {
    if (this.dirtyPositions.size === 0) return 0;

    const positions = Array.from(this.dirtyPositions.values());
    this.dirtyPositions.clear();

    const supabase = getSupabase();
    let written = 0;

    for (const pos of positions) {
      const update: PositionUpdate = {
        updated_at: pos.updatedAt.toISOString(),
        state: pos.state,
        entry_order_id: pos.entryOrderId ?? null,
        entry_price: pos.entryPrice ?? null,
        current_sl: pos.currentSl,
        unrealized_pnl: pos.unrealizedPnl,
        last_price: pos.lastPrice ?? null,
        exit_price: pos.exitPrice ?? null,
        exit_reason: pos.exitReason ?? null,
        closed_at: pos.closedAt?.toISOString() ?? null,
        llm_reasoning: pos.llmReasoning ?? null,
        llm_confidence: pos.llmConfidence ?? null,
        confirmation_score: pos.confirmationScore ?? null,
      };

      const { error } = await supabase
        .from('positions')
        .update(update as never)
        .eq('id', pos.id);

      if (error) {
        logger.error('Failed to update position', { positionId: pos.id, error: error.message });
        // Re-add to dirty queue for retry
        this.dirtyPositions.set(pos.id, pos);
      } else {
        written++;
      }
    }

    if (written > 0) {
      logger.info('Flushed positions to Supabase', { count: written });
    }

    return written;
  }

  /** Write a completed trade to trades_log immediately */
  async writeTradeLog(trade: TradeResult): Promise<void> {
    const supabase = getSupabase();

    const insert: TradesLogInsert = {
      position_id: trade.positionId,
      alert_id: trade.alertId,
      symbol: trade.symbol,
      side: trade.side,
      entry_price: trade.entryPrice,
      entry_time: trade.entryTime.toISOString(),
      exit_price: trade.exitPrice,
      exit_time: trade.exitTime.toISOString(),
      exit_reason: trade.exitReason,
      quantity: trade.quantity,
      gross_pnl: trade.grossPnl,
      fees: trade.fees,
      net_pnl: trade.netPnl,
      vpvr_poc: trade.vpvrPoc,
      vpvr_vah: trade.vpvrVah,
      vpvr_val: trade.vpvrVal,
      highest_tp_hit: trade.highestTpHit,
      confirmation_score: trade.confirmationScore ?? null,
      llm_reasoning: trade.llmReasoning ?? null,
    };

    const { error } = await supabase.from('trades_log').insert(insert as never);

    if (error) {
      logger.error('Failed to write trade log', { positionId: trade.positionId, error: error.message });
    } else {
      logger.info('Trade logged', { positionId: trade.positionId, netPnl: trade.netPnl });
    }
  }

  /** Create a new position record in Supabase */
  async createPosition(position: ManagedPosition): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase.from('positions').insert({
      id: position.id,
      alert_id: position.alertId,
      symbol: position.symbol,
      side: position.side,
      state: position.state,
      target_entry_price: position.targetEntryPrice,
      quantity: position.quantity,
      contract_id: position.contractId,
      account_id: position.accountId,
      current_sl: position.currentSl,
      initial_sl: position.initialSl,
      tp1_price: position.tp1Price,
      tp2_price: position.tp2Price,
      tp3_price: position.tp3Price,
      vpvr_data: position.vpvrData as unknown as Record<string, unknown>,
      confirmation_score: position.confirmationScore ?? null,
    } as never);

    if (error) {
      logger.error('Failed to create position', { positionId: position.id, error: error.message });
    }
  }

  /** Get count of pending dirty writes */
  get pendingCount(): number {
    return this.dirtyPositions.size;
  }
}
