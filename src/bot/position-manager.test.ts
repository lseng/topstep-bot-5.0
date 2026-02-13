import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionManager } from './position-manager';
import type { PositionManagerConfig } from './position-manager';
import type { AlertRow } from '../types/database';
import type { VpvrResult } from '../services/vpvr/types';
import type { TradeResult } from './types';

/** Helper to create a VpvrResult */
function makeVpvr(overrides?: Partial<VpvrResult>): VpvrResult {
  return {
    bins: [],
    poc: 5050,
    vah: 5080,
    val: 5020,
    totalVolume: 100000,
    rangeHigh: 5100,
    rangeLow: 5000,
    barCount: 60,
    ...overrides,
  };
}

/** Helper to create an AlertRow */
function makeAlert(overrides?: Partial<AlertRow>): AlertRow {
  return {
    id: 'alert-1',
    created_at: '2026-02-12T15:00:00Z',
    symbol: 'ES',
    action: 'buy',
    quantity: 1,
    order_type: 'market',
    price: null,
    stop_loss: null,
    take_profit: null,
    comment: null,
    status: 'received',
    error_message: null,
    order_id: null,
    executed_at: null,
    raw_payload: {},
    ...overrides,
  };
}

const defaultConfig: PositionManagerConfig = {
  accountId: 1001,
  contractIds: new Map([['ES', 'CON.F.US.EPH26']]),
  symbols: ['ES'],
  quantity: 1,
};

describe('PositionManager', () => {
  let pm: PositionManager;

  beforeEach(() => {
    pm = new PositionManager(defaultConfig);
  });

  describe('onAlert — creates pending_entry', () => {
    it('creates a pending_entry position on buy alert', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();

      pm.onAlert(alert, vpvr);

      const positions = Array.from(pm.positions.values());
      expect(positions).toHaveLength(1);
      expect(positions[0].state).toBe('pending_entry');
      expect(positions[0].side).toBe('long');
      expect(positions[0].targetEntryPrice).toBe(5020); // VAL
    });

    it('creates a pending_entry position on sell alert', () => {
      const alert = makeAlert({ action: 'sell' });
      const vpvr = makeVpvr();

      pm.onAlert(alert, vpvr);

      const positions = Array.from(pm.positions.values());
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('short');
      expect(positions[0].targetEntryPrice).toBe(5080); // VAH
    });

    it('emits placeOrder event with correct params', () => {
      const handler = vi.fn();
      pm.on('placeOrder', handler);

      pm.onAlert(makeAlert({ action: 'buy' }), makeVpvr());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ES',
          side: 'long',
          price: 5020,
          quantity: 1,
        }),
      );
    });

    it('emits stateChange event for new position', () => {
      const handler = vi.fn();
      pm.on('stateChange', handler);

      pm.onAlert(makeAlert(), makeVpvr());

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          newState: 'pending_entry',
        }),
      );
    });

    it('sets correct TP/SL levels for long', () => {
      pm.onAlert(makeAlert({ action: 'buy' }), makeVpvr());
      const pos = pm.positions.get('ES')!;

      expect(pos.tp1Price).toBe(5050); // POC
      expect(pos.tp2Price).toBe(5080); // VAH
      expect(pos.tp3Price).toBe(5100); // rangeHigh
      expect(pos.currentSl).toBe(4990); // VAL - (POC - VAL) = 5020 - 30
    });

    it('sets confirmation score when provided', () => {
      pm.onAlert(makeAlert(), makeVpvr(), 85);
      const pos = pm.positions.get('ES')!;
      expect(pos.confirmationScore).toBe(85);
    });
  });

  describe('onAlert — opposing alert cancels/closes existing', () => {
    it('cancels pending_entry on opposing alert', () => {
      const cancelHandler = vi.fn();
      pm.on('cancelOrder', cancelHandler);

      // Create buy pending_entry
      pm.onAlert(makeAlert({ id: 'a1', action: 'buy' }), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;

      // Opposing sell alert
      pm.onAlert(makeAlert({ id: 'a2', action: 'sell' }), makeVpvr());

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 123 }),
      );
    });

    it('closes active position on opposing alert', () => {
      const closeHandler = vi.fn();
      pm.on('closePosition', closeHandler);

      // Create and fill buy
      pm.onAlert(makeAlert({ id: 'a1', action: 'buy' }), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);

      // Opposing sell alert
      pm.onAlert(makeAlert({ id: 'a2', action: 'sell' }), makeVpvr());

      expect(closeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ES',
          reason: 'opposing_alert',
        }),
      );
    });

    it('replaces position on same symbol', () => {
      pm.onAlert(makeAlert({ id: 'a1', action: 'buy' }), makeVpvr());
      pm.onAlert(makeAlert({ id: 'a2', action: 'sell' }), makeVpvr());

      // Should have the sell position now
      const pos = pm.positions.get('ES')!;
      expect(pos.side).toBe('short');
      expect(pos.alertId).toBe('a2');
    });
  });

  describe('onAlert — close action closes active position', () => {
    it('close alert closes active position', () => {
      const closeHandler = vi.fn();
      pm.on('closePosition', closeHandler);

      pm.onAlert(makeAlert({ id: 'a1', action: 'buy' }), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);

      pm.onAlert(makeAlert({ id: 'a2', action: 'close' }), makeVpvr());

      expect(closeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'close_alert',
        }),
      );
    });

    it('close_long alert does nothing when no active position', () => {
      const closeHandler = vi.fn();
      pm.on('closePosition', closeHandler);

      pm.onAlert(makeAlert({ action: 'close_long' }), makeVpvr());
      expect(closeHandler).not.toHaveBeenCalled();
    });
  });

  describe('onOrderFill — transitions to active', () => {
    it('transitions pending_entry to active on fill', () => {
      const stateHandler = vi.fn();
      pm.on('stateChange', stateHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;

      pm.onOrderFill(123, 5020);

      expect(pos.state).toBe('active');
      expect(pos.entryPrice).toBe(5020);
      expect(stateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          oldState: 'pending_entry',
          newState: 'active',
        }),
      );
    });

    it('ignores fill for unknown order ID', () => {
      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;

      pm.onOrderFill(999, 5020);
      expect(pos.state).toBe('pending_entry');
    });

    it('ignores fill if position is not pending_entry', () => {
      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020); // Now active

      pm.onOrderFill(123, 5025); // Duplicate fill
      expect(pos.entryPrice).toBe(5020); // Unchanged
    });
  });

  describe('onTick — trailing stop evaluation', () => {
    function setupActivePosition(): void {
      pm.onAlert(makeAlert({ action: 'buy' }), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);
    }

    it('TP1 hit transitions to tp1_hit and moves SL to entry', () => {
      setupActivePosition();
      const stateHandler = vi.fn();
      pm.on('stateChange', stateHandler);

      pm.onTick('ES', 5050, new Date()); // At TP1 (POC)

      const pos = pm.positions.get('ES')!;
      expect(pos.state).toBe('tp1_hit');
      expect(pos.currentSl).toBe(5020); // Entry price
    });

    it('TP2 hit from tp1_hit moves SL to TP1', () => {
      setupActivePosition();

      pm.onTick('ES', 5050, new Date()); // TP1
      pm.onTick('ES', 5080, new Date()); // TP2

      const pos = pm.positions.get('ES')!;
      expect(pos.state).toBe('tp2_hit');
      expect(pos.currentSl).toBe(5050); // TP1 price
    });

    it('TP3 hit from tp2_hit moves SL to TP2', () => {
      setupActivePosition();

      pm.onTick('ES', 5050, new Date()); // TP1
      pm.onTick('ES', 5080, new Date()); // TP2
      pm.onTick('ES', 5100, new Date()); // TP3

      const pos = pm.positions.get('ES')!;
      expect(pos.state).toBe('tp3_hit');
      expect(pos.currentSl).toBe(5080); // TP2 price
    });

    it('SL breach emits closePosition event', () => {
      setupActivePosition();
      const closeHandler = vi.fn();
      pm.on('closePosition', closeHandler);

      pm.onTick('ES', 4990, new Date()); // At initial SL (mirrored TP1 distance)

      expect(closeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ES',
          side: 'long',
          reason: 'sl_hit_from_active',
        }),
      );
    });

    it('updates unrealized PnL on tick', () => {
      setupActivePosition();

      pm.onTick('ES', 5030, new Date()); // 10 points up

      const pos = pm.positions.get('ES')!;
      // (5030 - 5020) * 50 * 1 = 500
      expect(pos.unrealizedPnl).toBe(500);
    });

    it('updates last price on tick', () => {
      setupActivePosition();
      pm.onTick('ES', 5035, new Date());

      expect(pm.positions.get('ES')!.lastPrice).toBe(5035);
    });

    it('ignores tick for unknown symbol', () => {
      setupActivePosition();
      // Should not throw
      pm.onTick('NQ', 15000, new Date());
    });

    it('ignores tick for pending_entry position', () => {
      pm.onAlert(makeAlert(), makeVpvr());

      const stateHandler = vi.fn();
      pm.on('stateChange', stateHandler);

      pm.onTick('ES', 5000, new Date());

      // stateChange handler was registered after onAlert, so no events from onAlert
      // onTick should not emit stateChange for pending_entry
      expect(stateHandler).toHaveBeenCalledTimes(0);
    });
  });

  describe('onClose — completes position', () => {
    it('transitions to closed and emits positionClosed', () => {
      const closedHandler = vi.fn();
      pm.on('positionClosed', closedHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);

      pm.onClose('ES', 5050, 'sl_hit');

      expect(pos.state).toBe('closed');
      expect(pos.exitPrice).toBe(5050);
      expect(closedHandler).toHaveBeenCalledTimes(1);

      const trade: TradeResult = closedHandler.mock.calls[0][0];
      expect(trade.entryPrice).toBe(5020);
      expect(trade.exitPrice).toBe(5050);
      expect(trade.grossPnl).toBe(1500); // (5050-5020)*50
    });

    it('ignores close for already closed position', () => {
      const closedHandler = vi.fn();
      pm.on('positionClosed', closedHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);

      pm.onClose('ES', 5050, 'sl_hit');
      pm.onClose('ES', 5060, 'sl_hit'); // Duplicate

      expect(closedHandler).toHaveBeenCalledTimes(1);
    });

    it('does not emit positionClosed if position was never filled', () => {
      const closedHandler = vi.fn();
      pm.on('positionClosed', closedHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      pm.onClose('ES', 5050, 'manual');

      expect(closedHandler).not.toHaveBeenCalled();
    });
  });

  describe('getActivePositions', () => {
    it('returns only non-closed/non-cancelled positions', () => {
      pm.onAlert(makeAlert({ id: 'a1', symbol: 'ES', action: 'buy' }), makeVpvr());

      expect(pm.getActivePositions()).toHaveLength(1);

      const pos = pm.positions.get('ES')!;
      pos.state = 'closed';

      expect(pm.getActivePositions()).toHaveLength(0);
    });
  });

  describe('dirty flag management', () => {
    it('new positions are dirty', () => {
      pm.onAlert(makeAlert(), makeVpvr());
      expect(pm.getDirtyPositions()).toHaveLength(1);
    });

    it('markClean clears dirty flag', () => {
      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;

      pm.markClean(pos.id);
      expect(pm.getDirtyPositions()).toHaveLength(0);
    });

    it('state transitions set dirty flag', () => {
      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.markClean(pos.id);

      pm.onOrderFill(123, 5020);
      expect(pos.dirty).toBe(true);
    });
  });

  describe('TradeResult — highestTpHit', () => {
    it('reports tp1 as highest when closed from tp1_hit', () => {
      const closedHandler = vi.fn();
      pm.on('positionClosed', closedHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);
      pm.onTick('ES', 5050, new Date()); // TP1

      pm.onClose('ES', 5020, 'sl_hit_from_tp1_hit');

      const trade: TradeResult = closedHandler.mock.calls[0][0];
      expect(trade.highestTpHit).toBe('tp1');
    });

    it('reports null when closed from active (no TP hit)', () => {
      const closedHandler = vi.fn();
      pm.on('positionClosed', closedHandler);

      pm.onAlert(makeAlert(), makeVpvr());
      const pos = pm.positions.get('ES')!;
      pos.entryOrderId = 123;
      pm.onOrderFill(123, 5020);

      pm.onClose('ES', 5018, 'sl_hit_from_active');

      const trade: TradeResult = closedHandler.mock.calls[0][0];
      expect(trade.highestTpHit).toBeNull();
    });
  });
});
