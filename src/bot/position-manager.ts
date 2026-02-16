// Position Manager — state machine managing active positions

import { EventEmitter } from 'events';
import type { AlertRow } from '../types/database';
import type { VpvrResult } from '../services/vpvr/types';
import type { ManagedPosition, PositionState, PositionSide, TradeResult, SfxTpLevels } from './types';
import type { EntryCalculation } from './entry-calculator';
import { calculateEntryPrice, calculateRetryEntryLevels, calculateSlFromEntry } from './entry-calculator';
import { evaluateTrailingStop } from './trailing-stop';
import { CONTRACT_SPECS, getMicroEquivalent } from '../services/topstepx/types';

/** Events emitted by the PositionManager */
export interface PositionManagerEvents {
  /** Request to place a limit entry order */
  placeOrder: (params: {
    symbol: string;
    side: PositionSide;
    price: number;
    quantity: number;
    positionId: string;
  }) => void;
  /** Request to cancel a pending entry order */
  cancelOrder: (params: {
    orderId: number;
    positionId: string;
  }) => void;
  /** Request to market close a position */
  closePosition: (params: {
    symbol: string;
    side: PositionSide;
    quantity: number;
    positionId: string;
    reason: string;
  }) => void;
  /** Position state changed */
  stateChange: (params: {
    positionId: string;
    oldState: PositionState;
    newState: PositionState;
    position: ManagedPosition;
  }) => void;
  /** Position fully closed — trade result for logging */
  positionClosed: (trade: TradeResult) => void;
  /** Alert skipped because position capacity has been reached */
  capacityExceeded: (params: {
    symbol: string;
    currentMicroEquivalent: number;
    maxMicroEquivalent: number;
    requiredMicroEquivalent: number;
  }) => void;
  /** Re-entry requested after SL hit from active state */
  retryEntry: (params: {
    symbol: string;
    side: PositionSide;
    steppedPrice: number;
    fallbackPrice: number;
    quantity: number;
    positionId: string;
    retryCount: number;
    maxRetries: number;
  }) => void;
}

/** Configuration for the position manager */
export interface PositionManagerConfig {
  accountId: number;
  contractIds: Map<string, string>;
  /** Trading symbols. Empty = accept all known symbols dynamically. */
  symbols: string[];
  quantity: number;
  /** Maximum contracts allowed across all symbols in micro-equivalent units (default: 30) */
  maxContracts: number;
  /** Maximum re-entry attempts per signal after SL hit (default: 3) */
  maxRetries: number;
  /** Fixed stop-loss buffer in ticks (default: 8) */
  slBufferTicks: number;
}

/**
 * Position Manager — manages a map of active ManagedPosition objects keyed by symbol.
 *
 * State machine:
 *   alert → pending_entry (limit order placed)
 *   fill → active (SL set)
 *   tick → evaluates trailing stop (TP progression / SL breach)
 *   SL hit from active → pending_retry (if retries remain) → retryEntry event
 *   close → closed (trade result emitted)
 *
 * Emits typed events for I/O actions (place/cancel/close orders, state changes).
 */
export class PositionManager extends EventEmitter {
  /** Active positions keyed by symbol */
  readonly positions = new Map<string, ManagedPosition>();

  private config: PositionManagerConfig;
  private positionCounter = 0;

  constructor(config: PositionManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * Handle a new alert. Creates a pending_entry or cancels/closes existing positions.
   * When sfxTpLevels are provided, they override VPVR-calculated TP levels.
   */
  onAlert(alert: AlertRow, vpvr: VpvrResult, confirmationScore?: number, sfxTpLevels?: SfxTpLevels): void {
    const { symbol, action } = alert;

    // Close actions → close existing position (cancels any pending retry)
    if (action === 'close' || action === 'close_long' || action === 'close_short') {
      const existing = this.positions.get(symbol);
      if (existing && existing.state !== 'closed' && existing.state !== 'cancelled') {
        if (existing.state === 'pending_retry' || existing.state === 'pending_entry') {
          this.cancelExisting(existing, 'close_alert');
        } else {
          this.closeExisting(existing, 'close_alert');
        }
      }
      return;
    }

    const newSide: PositionSide = action === 'buy' ? 'long' : 'short';

    // Cancel/close existing position on same symbol if any (including pending_retry)
    const existing = this.positions.get(symbol);
    if (existing && existing.state !== 'closed' && existing.state !== 'cancelled') {
      if (existing.state === 'pending_entry' || existing.state === 'pending_retry') {
        // Cancel pending entry or pending retry
        this.cancelExisting(existing, 'opposing_alert');
      } else {
        // Close active position
        this.closeExisting(existing, 'opposing_alert');
      }
    }

    // Check capacity before placing a new order
    const requiredMicro = getMicroEquivalent(symbol, this.config.quantity);
    const currentMicro = this.getCurrentMicroEquivalent();
    // Subtract any capacity freed by cancelling/closing the same-symbol position above
    const existingMicro = existing && existing.state !== 'closed' && existing.state !== 'cancelled'
      ? getMicroEquivalent(existing.symbol, existing.quantity)
      : 0;
    const effectiveCurrent = currentMicro - existingMicro;

    if (effectiveCurrent + requiredMicro > this.config.maxContracts) {
      this.emit('capacityExceeded', {
        symbol,
        currentMicroEquivalent: effectiveCurrent,
        maxMicroEquivalent: this.config.maxContracts,
        requiredMicroEquivalent: requiredMicro,
      });
      return;
    }

    // Calculate entry from VPVR (with slBufferTicks if configured)
    const entry = calculateEntryPrice(action, vpvr, {
      symbol: alert.symbol,
      slBufferTicks: this.config.slBufferTicks,
    });

    if (!entry) return;

    // Calculate retry entry levels for the full ladder
    const retryLevels = calculateRetryEntryLevels(newSide, vpvr, this.config.maxRetries);

    // Override VPVR TPs and SL with SFX levels when available
    if (sfxTpLevels) {
      entry.tp1 = sfxTpLevels.tp1;
      entry.tp2 = sfxTpLevels.tp2;
      entry.tp3 = sfxTpLevels.tp3;
      if (sfxTpLevels.stopLoss != null) {
        entry.initialSl = sfxTpLevels.stopLoss;
      }
    }

    // Create new managed position
    const position = this.createPosition(alert, vpvr, entry, newSide, retryLevels, confirmationScore);
    this.positions.set(symbol, position);

    // Emit place order event
    this.emit('placeOrder', {
      symbol,
      side: newSide,
      price: entry.entryPrice,
      quantity: this.config.quantity,
      positionId: position.id,
    });

    this.emit('stateChange', {
      positionId: position.id,
      oldState: 'pending_entry' as PositionState,
      newState: 'pending_entry',
      position,
    });
  }

  /**
   * Handle an order fill event from the exchange.
   */
  onOrderFill(orderId: number, fillPrice: number): void {
    const position = this.findByOrderId(orderId);
    if (!position || position.state !== 'pending_entry') return;

    const oldState = position.state;
    position.state = 'active';
    position.entryPrice = fillPrice;
    position.updatedAt = new Date();
    position.dirty = true;

    // Recalculate SL from actual fill price when using tick buffer
    // Skip for SFX positions — they use the absolute SL from the SFX signal
    if (this.config.slBufferTicks > 0 && position.strategy !== 'sfx-algo') {
      const newSl = calculateSlFromEntry(
        fillPrice, position.side, position.symbol, this.config.slBufferTicks,
      );
      position.currentSl = newSl;
      position.initialSl = newSl;
    }

    this.emit('stateChange', {
      positionId: position.id,
      oldState,
      newState: 'active',
      position,
    });
  }

  /**
   * Handle a price tick from market data.
   */
  onTick(symbol: string, price: number, timestamp: Date): void {
    const position = this.positions.get(symbol);
    if (!position) return;

    // Only process ticks for active positions
    if (
      position.state !== 'active' &&
      position.state !== 'tp1_hit' &&
      position.state !== 'tp2_hit' &&
      position.state !== 'tp3_hit'
    ) {
      return;
    }

    // Update last price and unrealized PnL
    position.lastPrice = price;
    position.updatedAt = timestamp;
    this.updateUnrealizedPnl(position, price);

    // Evaluate trailing stop
    const result = evaluateTrailingStop(position, price);

    if (result.shouldClose) {
      // Emit close position event
      this.emit('closePosition', {
        symbol,
        side: position.side,
        quantity: position.quantity,
        positionId: position.id,
        reason: result.closeReason ?? 'sl_hit',
      });
      return;
    }

    if (result.newState) {
      const oldState = position.state;
      position.state = result.newState;
      position.dirty = true;

      if (result.newSl != null) {
        position.currentSl = result.newSl;
      }

      this.emit('stateChange', {
        positionId: position.id,
        oldState,
        newState: result.newState,
        position,
      });
    }
  }

  /**
   * Handle position close (from SL breach or manual close).
   *
   * If the close was an SL hit from `active` state (no TP hit yet) and retries
   * remain, transitions to `pending_retry` and emits `retryEntry` instead of
   * fully closing.
   */
  onClose(symbol: string, exitPrice: number, reason: string): void {
    const position = this.positions.get(symbol);
    if (!position || position.state === 'closed' || position.state === 'cancelled') return;

    const oldState = position.state;

    // Check if this is an SL hit from active state with retries remaining
    const isSLHitFromActive = reason.startsWith('sl_hit_from_active') && oldState === 'active';
    const hasRetriesLeft = position.retryCount < position.maxRetries;

    if (isSLHitFromActive && hasRetriesLeft) {
      // Emit trade result for this leg before retrying
      position.exitPrice = exitPrice;
      position.exitReason = reason;
      position.closedAt = new Date();
      position.updatedAt = new Date();
      position.dirty = true;

      if (position.entryPrice != null) {
        const trade = this.buildTradeResult(position);
        this.emit('positionClosed', trade);
      }

      // Transition to pending_retry
      position.state = 'pending_retry';
      const nextRetryCount = position.retryCount + 1;
      const steppedPrice = position.retryEntryLevels[nextRetryCount] ?? position.retryEntryLevels[0];
      const fallbackPrice = position.retryEntryLevels[0]; // Original VAL/VAH

      this.emit('stateChange', {
        positionId: position.id,
        oldState,
        newState: 'pending_retry',
        position,
      });

      // Emit retryEntry event for the runner to place orders
      this.emit('retryEntry', {
        symbol,
        side: position.side,
        steppedPrice,
        fallbackPrice,
        quantity: position.quantity,
        positionId: position.id,
        retryCount: nextRetryCount,
        maxRetries: position.maxRetries,
      });
      return;
    }

    // Normal close — no retry
    position.state = 'closed';
    position.exitPrice = exitPrice;
    position.exitReason = reason;
    position.closedAt = new Date();
    position.updatedAt = new Date();
    position.dirty = true;

    this.emit('stateChange', {
      positionId: position.id,
      oldState,
      newState: 'closed',
      position,
    });

    // Emit trade result if position was filled
    if (position.entryPrice != null) {
      const trade = this.buildTradeResult(position);
      this.emit('positionClosed', trade);
    }
  }

  /**
   * Transition a position from pending_retry back to pending_entry.
   * Called by the runner after placing retry limit orders.
   */
  onRetryOrderPlaced(symbol: string, retryCount: number): void {
    const position = this.positions.get(symbol);
    if (!position || position.state !== 'pending_retry') return;

    const oldState = position.state;
    position.retryCount = retryCount;
    position.state = 'pending_entry';
    position.entryPrice = undefined;
    position.exitPrice = undefined;
    position.exitReason = undefined;
    position.closedAt = undefined;
    position.updatedAt = new Date();
    position.dirty = true;

    // Reset SL — will be recalculated on fill
    position.currentSl = position.initialSl;

    this.emit('stateChange', {
      positionId: position.id,
      oldState,
      newState: 'pending_entry',
      position,
    });
  }

  /** Get all active (non-closed, non-cancelled) positions */
  getActivePositions(): ManagedPosition[] {
    return Array.from(this.positions.values()).filter(
      (p) => p.state !== 'closed' && p.state !== 'cancelled',
    );
  }

  /** Get all dirty positions that need to be flushed */
  getDirtyPositions(): ManagedPosition[] {
    return Array.from(this.positions.values()).filter((p) => p.dirty);
  }

  /** Mark a position as clean (after successful write) */
  markClean(positionId: string): void {
    for (const pos of this.positions.values()) {
      if (pos.id === positionId) {
        pos.dirty = false;
        break;
      }
    }
  }

  /**
   * Get the total micro-equivalent contract count across all active positions.
   * Mini contracts (ES, NQ) count as 10 micro-equivalent units each.
   * Micro contracts count as 1 micro-equivalent unit each.
   */
  getCurrentMicroEquivalent(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      if (pos.state !== 'closed' && pos.state !== 'cancelled') {
        total += getMicroEquivalent(pos.symbol, pos.quantity);
      }
    }
    return total;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private createPosition(
    alert: AlertRow,
    vpvr: VpvrResult,
    entry: EntryCalculation,
    side: PositionSide,
    retryLevels: number[],
    confirmationScore?: number,
  ): ManagedPosition {
    this.positionCounter++;
    const now = new Date();

    return {
      id: crypto.randomUUID(),
      alertId: alert.id,
      symbol: alert.symbol,
      side,
      state: 'pending_entry',
      targetEntryPrice: entry.entryPrice,
      quantity: this.config.quantity,
      contractId: this.config.contractIds.get(alert.symbol) ?? '',
      accountId: this.config.accountId,
      currentSl: entry.initialSl,
      initialSl: entry.initialSl,
      tp1Price: entry.tp1,
      tp2Price: entry.tp2,
      tp3Price: entry.tp3,
      unrealizedPnl: 0,
      vpvrData: vpvr,
      confirmationScore,
      createdAt: now,
      updatedAt: now,
      dirty: true,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      originalAlertId: alert.id,
      retryEntryLevels: retryLevels,
      strategy: (alert.strategy ?? (alert.raw_payload?.strategy as string | undefined)) || 'vpvr',
    };
  }

  private cancelExisting(position: ManagedPosition, reason: string): void {
    const oldState = position.state;
    position.state = 'cancelled';
    position.exitReason = reason;
    position.closedAt = new Date();
    position.updatedAt = new Date();
    position.dirty = true;

    if (position.entryOrderId) {
      this.emit('cancelOrder', {
        orderId: position.entryOrderId,
        positionId: position.id,
      });
    }

    this.emit('stateChange', {
      positionId: position.id,
      oldState,
      newState: 'cancelled',
      position,
    });
  }

  private closeExisting(position: ManagedPosition, reason: string): void {
    this.emit('closePosition', {
      symbol: position.symbol,
      side: position.side,
      quantity: position.quantity,
      positionId: position.id,
      reason,
    });
  }

  private findByOrderId(orderId: number): ManagedPosition | undefined {
    for (const pos of this.positions.values()) {
      if (pos.entryOrderId === orderId) return pos;
    }
    return undefined;
  }

  private updateUnrealizedPnl(position: ManagedPosition, currentPrice: number): void {
    if (position.entryPrice == null) return;

    const pointValue =
      CONTRACT_SPECS[position.symbol]?.pointValue ?? 50;
    const priceDiff =
      position.side === 'long'
        ? currentPrice - position.entryPrice
        : position.entryPrice - currentPrice;

    position.unrealizedPnl = priceDiff * pointValue * position.quantity;
  }

  private buildTradeResult(position: ManagedPosition): TradeResult {
    const pointValue =
      CONTRACT_SPECS[position.symbol]?.pointValue ?? 50;
    const entryPrice = position.entryPrice!;
    const exitPrice = position.exitPrice!;
    const priceDiff =
      position.side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
    const grossPnl = priceDiff * pointValue * position.quantity;

    // Determine highest TP hit from state
    let highestTpHit: string | null = null;
    if (position.exitReason?.includes('tp3') || position.state === 'tp3_hit') {
      highestTpHit = 'tp3';
    } else if (position.exitReason?.includes('tp2') || position.state === 'tp2_hit') {
      highestTpHit = 'tp2';
    } else if (position.exitReason?.includes('tp1') || position.state === 'tp1_hit') {
      highestTpHit = 'tp1';
    }

    return {
      positionId: position.id,
      alertId: position.alertId,
      symbol: position.symbol,
      side: position.side,
      entryPrice,
      entryTime: position.createdAt,
      exitPrice,
      exitTime: position.closedAt ?? new Date(),
      exitReason: position.exitReason ?? 'unknown',
      quantity: position.quantity,
      grossPnl,
      fees: 0,
      netPnl: grossPnl,
      vpvrPoc: position.vpvrData.poc,
      vpvrVah: position.vpvrData.vah,
      vpvrVal: position.vpvrData.val,
      highestTpHit,
      confirmationScore: position.confirmationScore,
      llmReasoning: position.llmReasoning,
      retryCount: position.retryCount,
      originalAlertId: position.originalAlertId,
    };
  }
}
