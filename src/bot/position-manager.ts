// Position Manager — State Machine
// Manages in-memory ManagedPosition map with event-driven state transitions

import { calculateEntry } from './entry-calculator';
import { evaluateTrailingStop } from './trailing-stop';
import type { ManagedPosition, PositionEvent, BotConfig } from './types';
import type { VPVRResult } from '../services/vpvr/types';
import type { TradeAction, PositionSide } from '../types/database';

type EventCallback = (event: PositionEvent) => void;

export class PositionManager {
  private positions: Map<string, ManagedPosition> = new Map();
  private eventListeners: EventCallback[] = [];
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  /** Register an event listener */
  onEvent(callback: EventCallback): () => void {
    this.eventListeners.push(callback);
    return (): void => {
      this.eventListeners = this.eventListeners.filter((cb) => cb !== callback);
    };
  }

  /** Open a new position from an alert + VPVR data */
  openPosition(
    positionId: string,
    alertId: string,
    symbol: string,
    action: TradeAction,
    quantity: number,
    vpvrData: VPVRResult,
    confirmationScore: number | null,
  ): ManagedPosition {
    const entry = calculateEntry(vpvrData, action);

    const position: ManagedPosition = {
      id: positionId,
      alertId,
      symbol,
      side: entry.side,
      state: 'pending_entry',
      quantity,
      contractId: this.config.contractId,
      accountId: this.config.accountId,
      entryOrderId: null,
      targetEntryPrice: entry.targetEntryPrice,
      entryPrice: null,
      tp1Price: entry.tp1Price,
      tp2Price: entry.tp2Price,
      tp3Price: entry.tp3Price,
      initialSl: entry.initialSl,
      currentSl: entry.initialSl,
      lastPrice: null,
      unrealizedPnl: 0,
      vpvrData,
      confirmationScore,
      llmReasoning: null,
      llmConfidence: null,
      createdAt: new Date(),
      exitPrice: null,
      exitReason: null,
      closedAt: null,
      dirty: true,
    };

    this.positions.set(positionId, position);
    this.emit({ type: 'opened', positionId });
    return position;
  }

  /** Set the entry order ID after placing the order */
  setEntryOrderId(positionId: string, orderId: number): void {
    const pos = this.getPosition(positionId);
    if (pos) {
      pos.entryOrderId = orderId;
      pos.dirty = true;
    }
  }

  /** Handle order fill — transition from pending_entry to active */
  onFill(positionId: string, fillPrice: number): void {
    const pos = this.getPosition(positionId);
    if (!pos || pos.state !== 'pending_entry') return;

    pos.state = 'active';
    pos.entryPrice = fillPrice;
    pos.dirty = true;
    this.emit({ type: 'filled', positionId, fillPrice });
  }

  /** Handle a price tick — check trailing stops and SL breach */
  onTick(symbol: string, price: number): PositionEvent[] {
    const events: PositionEvent[] = [];

    for (const pos of this.positions.values()) {
      if (pos.symbol !== symbol) continue;
      if (pos.state === 'closed' || pos.state === 'cancelled' || pos.state === 'pending_entry') continue;
      if (pos.entryPrice === null) continue;

      pos.lastPrice = price;

      // Calculate unrealized P&L
      const priceDiff = pos.side === 'long' ? price - pos.entryPrice : pos.entryPrice - price;
      pos.unrealizedPnl = priceDiff * pos.quantity;

      const result = evaluateTrailingStop({
        side: pos.side,
        state: pos.state,
        currentPrice: price,
        entryPrice: pos.entryPrice,
        currentSl: pos.currentSl,
        tp1Price: pos.tp1Price,
        tp2Price: pos.tp2Price,
        tp3Price: pos.tp3Price,
      });

      if (result.slBreached) {
        pos.state = 'closed';
        pos.exitPrice = price;
        pos.exitReason = 'sl_breach';
        pos.closedAt = new Date();
        pos.dirty = true;
        const event: PositionEvent = { type: 'sl_breached', positionId: pos.id, price };
        events.push(event);
        this.emit(event);
      } else if (result.tpHit) {
        pos.state = result.newState;
        pos.currentSl = result.newSl;
        pos.dirty = true;
        const event: PositionEvent = { type: 'tp_hit', positionId: pos.id, level: result.tpHit, newSl: result.newSl };
        events.push(event);
        this.emit(event);
      }
    }

    return events;
  }

  /** Handle opposing alert — cancel pending or close active positions for the symbol */
  onOpposingAlert(symbol: string, newAction: TradeAction): PositionEvent[] {
    const events: PositionEvent[] = [];
    const opposingSide: PositionSide = (newAction === 'buy') ? 'long' : 'short';

    for (const pos of this.positions.values()) {
      if (pos.symbol !== symbol) continue;
      if (pos.state === 'closed' || pos.state === 'cancelled') continue;

      // Cancel pending entries on same side (opposing alert means different side)
      // Or close active positions on opposite side
      if (pos.side !== opposingSide) {
        if (pos.state === 'pending_entry') {
          pos.state = 'cancelled';
          pos.exitReason = 'opposing_alert';
          pos.closedAt = new Date();
          pos.dirty = true;
          const event: PositionEvent = { type: 'cancelled', positionId: pos.id, reason: 'opposing_alert' };
          events.push(event);
          this.emit(event);
        } else {
          // Active position — needs market close
          const price = pos.lastPrice ?? pos.entryPrice ?? 0;
          pos.state = 'closed';
          pos.exitPrice = price;
          pos.exitReason = 'opposing_alert';
          pos.closedAt = new Date();
          pos.dirty = true;
          const event: PositionEvent = { type: 'closed', positionId: pos.id, reason: 'opposing_alert', exitPrice: price };
          events.push(event);
          this.emit(event);
        }
      }
    }

    return events;
  }

  /** Manually close a position */
  closePosition(positionId: string, exitPrice: number, reason: string): void {
    const pos = this.getPosition(positionId);
    if (!pos || pos.state === 'closed' || pos.state === 'cancelled') return;

    pos.state = 'closed';
    pos.exitPrice = exitPrice;
    pos.exitReason = reason;
    pos.closedAt = new Date();
    pos.dirty = true;
    this.emit({ type: 'closed', positionId, reason, exitPrice });
  }

  /** Get a position by ID */
  getPosition(positionId: string): ManagedPosition | undefined {
    return this.positions.get(positionId);
  }

  /** Get all positions */
  getAllPositions(): ManagedPosition[] {
    return Array.from(this.positions.values());
  }

  /** Get active (non-closed, non-cancelled) positions */
  getActivePositions(): ManagedPosition[] {
    return this.getAllPositions().filter(
      (p) => p.state !== 'closed' && p.state !== 'cancelled'
    );
  }

  /** Get all dirty positions and reset dirty flag */
  flushDirty(): ManagedPosition[] {
    const dirty = this.getAllPositions().filter((p) => p.dirty);
    for (const p of dirty) {
      p.dirty = false;
    }
    return dirty;
  }

  /** Set LLM data for a position */
  setLLMData(positionId: string, reasoning: string, confidence: number): void {
    const pos = this.getPosition(positionId);
    if (pos) {
      pos.llmReasoning = reasoning;
      pos.llmConfidence = confidence;
      pos.dirty = true;
    }
  }

  private emit(event: PositionEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
