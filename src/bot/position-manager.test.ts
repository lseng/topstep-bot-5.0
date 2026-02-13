import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionManager } from './position-manager';
import type { PositionEvent, ManagedPosition } from './types';
import type { VPVRResult } from '../services/vpvr/types';

const mockVPVR: VPVRResult = {
  poc: 18500,
  vah: 18550,
  val: 18450,
  rangeHigh: 18600,
  rangeLow: 18400,
  profileBins: [],
  totalVolume: 50000,
};

const config = {
  accountId: 1,
  contractId: 'CON.F.US.ENQ.M25',
  dryRun: false,
};

describe('PositionManager', () => {
  let pm: PositionManager;
  let events: PositionEvent[];

  beforeEach(() => {
    pm = new PositionManager(config);
    events = [];
    pm.onEvent((e) => events.push(e));
  });

  describe('openPosition', () => {
    it('should create a pending_entry position for buy', () => {
      const pos = pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      expect(pos.state).toBe('pending_entry');
      expect(pos.side).toBe('long');
      expect(pos.targetEntryPrice).toBe(18450); // VAL
      expect(pos.tp1Price).toBe(18500); // POC
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('opened');
    });

    it('should create a pending_entry position for sell', () => {
      const pos = pm.openPosition('pos-1', 'alert-1', 'NQ', 'sell', 1, mockVPVR, 85);
      expect(pos.state).toBe('pending_entry');
      expect(pos.side).toBe('short');
      expect(pos.targetEntryPrice).toBe(18550); // VAH
    });

    it('should store position in the map', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      expect(pm.getPosition('pos-1')).toBeDefined();
      expect(pm.getAllPositions()).toHaveLength(1);
    });

    it('should mark position as dirty', () => {
      const pos = pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      expect(pos.dirty).toBe(true);
    });
  });

  describe('setEntryOrderId', () => {
    it('should set the order ID', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.setEntryOrderId('pos-1', 12345);
      expect(pm.getPosition('pos-1')?.entryOrderId).toBe(12345);
    });
  });

  describe('onFill', () => {
    it('should transition from pending_entry to active', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18452);
      const pos = pm.getPosition('pos-1')!;
      expect(pos.state).toBe('active');
      expect(pos.entryPrice).toBe(18452);
      expect(events).toHaveLength(2); // opened + filled
      expect(events[1].type).toBe('filled');
    });

    it('should not transition if not pending_entry', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18452);
      pm.onFill('pos-1', 18460); // Second fill should be ignored
      expect(events).toHaveLength(2); // Only opened + first filled
    });

    it('should ignore unknown position IDs', () => {
      pm.onFill('unknown', 18452);
      expect(events).toHaveLength(0);
    });
  });

  describe('onTick — trailing stop progression', () => {
    let pos: ManagedPosition;

    beforeEach(() => {
      pos = pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18450);
      events = []; // Clear events from open + fill
    });

    it('should not change state below TP1', () => {
      pm.onTick('NQ', 18480);
      expect(pm.getPosition('pos-1')!.state).toBe('active');
      expect(events).toHaveLength(0);
    });

    it('should update lastPrice and unrealizedPnl', () => {
      pm.onTick('NQ', 18480);
      const p = pm.getPosition('pos-1')!;
      expect(p.lastPrice).toBe(18480);
      expect(p.unrealizedPnl).toBe(30); // (18480 - 18450) * 1
    });

    it('should hit TP1 and move SL to entry', () => {
      pm.onTick('NQ', 18505);
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('tp1_hit');
      expect(p.currentSl).toBe(18450); // Entry = breakeven
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'tp_hit', positionId: 'pos-1', level: 'tp1', newSl: 18450 });
    });

    it('should hit TP2 and move SL to TP1', () => {
      pm.onTick('NQ', 18505); // TP1
      pm.onTick('NQ', 18555); // TP2
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('tp2_hit');
      expect(p.currentSl).toBe(18500); // TP1
    });

    it('should hit TP3 and move SL to TP2', () => {
      pm.onTick('NQ', 18505);
      pm.onTick('NQ', 18555);
      pm.onTick('NQ', 18605);
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('tp3_hit');
      expect(p.currentSl).toBe(18550); // TP2
    });

    it('should close on SL breach', () => {
      const initialSl = pm.getPosition('pos-1')!.currentSl;
      pm.onTick('NQ', initialSl - 1);
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('closed');
      expect(p.exitReason).toBe('sl_breach');
      expect(p.closedAt).not.toBeNull();
    });

    it('should close on SL breach after TP1', () => {
      pm.onTick('NQ', 18505); // TP1 → SL at entry (18450)
      pm.onTick('NQ', 18448); // Below entry SL
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('closed');
    });

    it('should ignore ticks for different symbols', () => {
      pm.onTick('ES', 18505);
      expect(pm.getPosition('pos-1')!.state).toBe('active');
    });

    it('should ignore ticks for closed positions', () => {
      pm.closePosition('pos-1', 18480, 'manual');
      const result = pm.onTick('NQ', 18600);
      expect(result).toHaveLength(0);
    });
  });

  describe('onTick — short positions', () => {
    beforeEach(() => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'sell', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18550);
      events = [];
    });

    it('should hit TP1 for short when price drops to POC', () => {
      pm.onTick('NQ', 18500);
      const p = pm.getPosition('pos-1')!;
      expect(p.state).toBe('tp1_hit');
      expect(p.currentSl).toBe(18550); // Entry
    });

    it('should calculate negative unrealized P&L for shorts going up', () => {
      pm.onTick('NQ', 18540);
      const p = pm.getPosition('pos-1')!;
      expect(p.unrealizedPnl).toBe(10); // (18550 - 18540) * 1
    });

    it('should close on SL breach for short (price goes up)', () => {
      const sl = pm.getPosition('pos-1')!.currentSl;
      pm.onTick('NQ', sl + 1);
      expect(pm.getPosition('pos-1')!.state).toBe('closed');
    });
  });

  describe('onOpposingAlert', () => {
    it('should cancel pending long when sell alert comes', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      events = [];

      const result = pm.onOpposingAlert('NQ', 'sell');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('cancelled');
      expect(pm.getPosition('pos-1')!.state).toBe('cancelled');
      expect(pm.getPosition('pos-1')!.exitReason).toBe('opposing_alert');
    });

    it('should close active long when sell alert comes', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18450);
      pm.onTick('NQ', 18480);
      events = [];

      const result = pm.onOpposingAlert('NQ', 'sell');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('closed');
      expect(pm.getPosition('pos-1')!.state).toBe('closed');
    });

    it('should not affect positions on different symbols', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      events = [];

      const result = pm.onOpposingAlert('ES', 'sell');
      expect(result).toHaveLength(0);
      expect(pm.getPosition('pos-1')!.state).toBe('pending_entry');
    });

    it('should not affect same-side positions', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      events = [];

      // New buy alert should not cancel existing long
      const result = pm.onOpposingAlert('NQ', 'buy');
      expect(result).toHaveLength(0);
    });

    it('should ignore already closed positions', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.closePosition('pos-1', 18440, 'manual');
      events = [];

      const result = pm.onOpposingAlert('NQ', 'sell');
      expect(result).toHaveLength(0);
    });
  });

  describe('closePosition', () => {
    it('should close an active position', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18450);
      events = [];

      pm.closePosition('pos-1', 18480, 'manual');
      const pos = pm.getPosition('pos-1')!;
      expect(pos.state).toBe('closed');
      expect(pos.exitPrice).toBe(18480);
      expect(pos.exitReason).toBe('manual');
      expect(pos.closedAt).not.toBeNull();
    });

    it('should not close already closed position', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.closePosition('pos-1', 18440, 'manual');
      events = [];

      pm.closePosition('pos-1', 18430, 'duplicate');
      expect(events).toHaveLength(0);
    });
  });

  describe('getActivePositions', () => {
    it('should return only non-closed, non-cancelled positions', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.openPosition('pos-2', 'alert-2', 'ES', 'sell', 1, mockVPVR, 75);
      pm.closePosition('pos-1', 18440, 'manual');

      const active = pm.getActivePositions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('pos-2');
    });
  });

  describe('flushDirty', () => {
    it('should return dirty positions and reset flag', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      const dirty = pm.flushDirty();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].dirty).toBe(false);

      // Second flush should return empty
      const dirty2 = pm.flushDirty();
      expect(dirty2).toHaveLength(0);
    });

    it('should return positions dirtied by ticks', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.onFill('pos-1', 18450);
      pm.flushDirty(); // Clear initial dirty

      pm.onTick('NQ', 18505); // TP1 hit
      const dirty = pm.flushDirty();
      expect(dirty).toHaveLength(1);
    });
  });

  describe('setLLMData', () => {
    it('should set LLM reasoning and confidence', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.setLLMData('pos-1', 'Strong VPVR confluence', 0.92);
      const pos = pm.getPosition('pos-1')!;
      expect(pos.llmReasoning).toBe('Strong VPVR confluence');
      expect(pos.llmConfidence).toBe(0.92);
      expect(pos.dirty).toBe(true);
    });
  });

  describe('event listener unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      const localEvents: PositionEvent[] = [];
      const unsub = pm.onEvent((e) => localEvents.push(e));

      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      expect(localEvents).toHaveLength(1);

      unsub();
      pm.openPosition('pos-2', 'alert-2', 'NQ', 'sell', 1, mockVPVR, 85);
      expect(localEvents).toHaveLength(1); // No new events
    });
  });

  describe('multiple concurrent positions', () => {
    it('should manage multiple positions independently', () => {
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, mockVPVR, 85);
      pm.openPosition('pos-2', 'alert-2', 'ES', 'sell', 2, mockVPVR, 70);

      pm.onFill('pos-1', 18450);
      pm.onFill('pos-2', 18550);

      pm.onTick('NQ', 18505); // TP1 for pos-1
      expect(pm.getPosition('pos-1')!.state).toBe('tp1_hit');
      expect(pm.getPosition('pos-2')!.state).toBe('active'); // ES not affected

      pm.onTick('ES', 18500); // TP1 for pos-2
      expect(pm.getPosition('pos-2')!.state).toBe('tp1_hit');
    });
  });
});
