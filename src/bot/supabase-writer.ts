// Supabase Write Queue — Rate-limited position updates
// 5-second flush interval with dirty flag pattern

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PositionInsert, TradeLogInsert } from '../types/database';
import type { ManagedPosition } from './types';

const FLUSH_INTERVAL_MS = 5000;

export class SupabaseWriteQueue {
  private supabase: SupabaseClient<Database>;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushDirty: () => ManagedPosition[];

  constructor(
    supabase: SupabaseClient<Database>,
    _getPositions: () => ManagedPosition[],
    flushDirty: () => ManagedPosition[],
  ) {
    this.supabase = supabase;
    this.flushDirty = flushDirty;
  }

  /** Start the periodic flush timer */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the periodic flush timer and do a final flush */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /** Flush all dirty positions to Supabase */
  async flush(): Promise<void> {
    const dirty = this.flushDirty();
    if (dirty.length === 0) return;

    const closedPositions: ManagedPosition[] = [];
    const positionUpserts: PositionInsert[] = dirty.map((pos) => {
      if (pos.state === 'closed') {
        closedPositions.push(pos);
      }
      return {
        id: pos.id,
        updated_at: new Date().toISOString(),
        alert_id: pos.alertId,
        symbol: pos.symbol,
        side: pos.side,
        state: pos.state,
        entry_order_id: pos.entryOrderId,
        entry_price: pos.entryPrice,
        target_entry_price: pos.targetEntryPrice,
        quantity: pos.quantity,
        contract_id: pos.contractId,
        account_id: pos.accountId,
        current_sl: pos.currentSl,
        initial_sl: pos.initialSl,
        tp1_price: pos.tp1Price,
        tp2_price: pos.tp2Price,
        tp3_price: pos.tp3Price,
        unrealized_pnl: pos.unrealizedPnl,
        last_price: pos.lastPrice,
        vpvr_data: pos.vpvrData as unknown as Record<string, unknown>,
        confirmation_score: pos.confirmationScore,
        exit_price: pos.exitPrice,
        exit_reason: pos.exitReason,
        closed_at: pos.closedAt?.toISOString() ?? null,
        llm_reasoning: pos.llmReasoning,
        llm_confidence: pos.llmConfidence,
      };
    });

    // Upsert positions
    const { error: posError } = await this.supabase
      .from('positions')
      .upsert(positionUpserts as never);

    if (posError) {
      console.error('Failed to upsert positions:', posError.message);
    }

    // Write closed positions to trades_log
    if (closedPositions.length > 0) {
      const tradeLogInserts: TradeLogInsert[] = closedPositions
        .filter((pos) => pos.entryPrice !== null && pos.exitPrice !== null)
        .map((pos) => {
          const priceDiff = pos.side === 'long'
            ? pos.exitPrice! - pos.entryPrice!
            : pos.entryPrice! - pos.exitPrice!;
          const grossPnl = priceDiff * pos.quantity;

          return {
            position_id: pos.id,
            alert_id: pos.alertId,
            symbol: pos.symbol,
            side: pos.side,
            entry_price: pos.entryPrice!,
            entry_time: pos.createdAt.toISOString(),
            exit_price: pos.exitPrice!,
            exit_time: pos.closedAt!.toISOString(),
            exit_reason: pos.exitReason ?? 'unknown',
            quantity: pos.quantity,
            gross_pnl: grossPnl,
            fees: 0,
            net_pnl: grossPnl,
            vpvr_poc: pos.vpvrData.poc,
            vpvr_vah: pos.vpvrData.vah,
            vpvr_val: pos.vpvrData.val,
            highest_tp_hit: pos.state === 'closed' ? this.getHighestTpHit(pos) : null,
            confirmation_score: pos.confirmationScore,
            llm_reasoning: pos.llmReasoning,
          };
        });

      if (tradeLogInserts.length > 0) {
        const { error: logError } = await this.supabase
          .from('trades_log')
          .insert(tradeLogInserts as never);

        if (logError) {
          console.error('Failed to insert trades_log:', logError.message);
        }
      }
    }
  }

  private getHighestTpHit(pos: ManagedPosition): string | null {
    // Check which TP was the highest hit before close
    if (pos.exitReason === 'sl_breach') {
      // Determine from the SL level what TP was last hit
      if (pos.side === 'long') {
        if (pos.currentSl >= pos.tp2Price) return 'tp3';
        if (pos.currentSl >= pos.tp1Price) return 'tp2';
        if (pos.entryPrice !== null && pos.currentSl >= pos.entryPrice) return 'tp1';
      } else {
        if (pos.currentSl <= pos.tp2Price) return 'tp3';
        if (pos.currentSl <= pos.tp1Price) return 'tp2';
        if (pos.entryPrice !== null && pos.currentSl <= pos.entryPrice) return 'tp1';
      }
    }
    return null;
  }
}
