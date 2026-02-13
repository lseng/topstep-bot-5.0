import { describe, it, expect } from 'vitest';
import { evaluateTrailingStop } from './trailing-stop';
import type { ManagedPosition, PositionState, PositionSide } from './types';
import type { VpvrResult } from '../services/vpvr/types';

/** Helper to create a minimal VpvrResult */
function makeVpvr(): VpvrResult {
  return {
    bins: [],
    poc: 5050,
    vah: 5080,
    val: 5020,
    totalVolume: 100000,
    rangeHigh: 5100,
    rangeLow: 5000,
    barCount: 60,
  };
}

/** Helper to create a managed position */
function makePosition(overrides?: Partial<ManagedPosition>): ManagedPosition {
  return {
    id: 'pos-1',
    alertId: 'alert-1',
    symbol: 'ES',
    side: 'long' as PositionSide,
    state: 'active' as PositionState,
    entryOrderId: 123,
    entryPrice: 5020,
    targetEntryPrice: 5020,
    quantity: 1,
    contractId: 'CON.F.US.EPH26',
    accountId: 1001,
    currentSl: 5018,
    initialSl: 5018,
    tp1Price: 5050,
    tp2Price: 5080,
    tp3Price: 5100,
    unrealizedPnl: 0,
    vpvrData: makeVpvr(),
    createdAt: new Date(),
    updatedAt: new Date(),
    dirty: false,
    ...overrides,
  };
}

describe('evaluateTrailingStop', () => {
  describe('long position — TP progression', () => {
    it('TP1 hit moves SL to entry (breakeven)', () => {
      const pos = makePosition({ state: 'active', entryPrice: 5020, currentSl: 5018 });
      const result = evaluateTrailingStop(pos, 5050); // price at TP1

      expect(result.newState).toBe('tp1_hit');
      expect(result.newSl).toBe(5020); // Entry price
      expect(result.shouldClose).toBe(false);
    });

    it('TP2 hit moves SL to TP1', () => {
      const pos = makePosition({ state: 'tp1_hit', currentSl: 5020 });
      const result = evaluateTrailingStop(pos, 5080); // price at TP2

      expect(result.newState).toBe('tp2_hit');
      expect(result.newSl).toBe(5050); // TP1 price
      expect(result.shouldClose).toBe(false);
    });

    it('TP3 hit moves SL to TP2', () => {
      const pos = makePosition({ state: 'tp2_hit', currentSl: 5050 });
      const result = evaluateTrailingStop(pos, 5100); // price at TP3

      expect(result.newState).toBe('tp3_hit');
      expect(result.newSl).toBe(5080); // TP2 price
      expect(result.shouldClose).toBe(false);
    });

    it('price above TP1 but state already tp1_hit does not re-trigger', () => {
      const pos = makePosition({ state: 'tp1_hit', currentSl: 5020 });
      const result = evaluateTrailingStop(pos, 5055); // above TP1 but below TP2

      expect(result.newState).toBeUndefined();
      expect(result.shouldClose).toBe(false);
    });
  });

  describe('long position — SL breach', () => {
    it('SL breach from active state closes position', () => {
      const pos = makePosition({ state: 'active', currentSl: 5018 });
      const result = evaluateTrailingStop(pos, 5018); // price at SL

      expect(result.newState).toBe('closed');
      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('sl_hit_from_active');
    });

    it('SL breach from tp1_hit state closes position', () => {
      const pos = makePosition({ state: 'tp1_hit', currentSl: 5020 });
      const result = evaluateTrailingStop(pos, 5019); // price below new SL

      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('sl_hit_from_tp1_hit');
    });

    it('SL breach from tp2_hit state closes position', () => {
      const pos = makePosition({ state: 'tp2_hit', currentSl: 5050 });
      const result = evaluateTrailingStop(pos, 5049);

      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('sl_hit_from_tp2_hit');
    });

    it('SL breach from tp3_hit state closes position', () => {
      const pos = makePosition({ state: 'tp3_hit', currentSl: 5080 });
      const result = evaluateTrailingStop(pos, 5079);

      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('sl_hit_from_tp3_hit');
    });
  });

  describe('short position — TP progression', () => {
    const shortPos = () =>
      makePosition({
        side: 'short',
        entryPrice: 5080,
        targetEntryPrice: 5080,
        currentSl: 5082,
        initialSl: 5082,
        tp1Price: 5050,
        tp2Price: 5020,
        tp3Price: 5000,
      });

    it('TP1 hit moves SL to entry (breakeven)', () => {
      const pos = shortPos();
      const result = evaluateTrailingStop(pos, 5050); // price at TP1

      expect(result.newState).toBe('tp1_hit');
      expect(result.newSl).toBe(5080); // Entry price
      expect(result.shouldClose).toBe(false);
    });

    it('TP2 hit moves SL to TP1', () => {
      const pos = { ...shortPos(), state: 'tp1_hit' as PositionState, currentSl: 5080 };
      const result = evaluateTrailingStop(pos, 5020);

      expect(result.newState).toBe('tp2_hit');
      expect(result.newSl).toBe(5050); // TP1
      expect(result.shouldClose).toBe(false);
    });

    it('TP3 hit moves SL to TP2', () => {
      const pos = { ...shortPos(), state: 'tp2_hit' as PositionState, currentSl: 5050 };
      const result = evaluateTrailingStop(pos, 5000);

      expect(result.newState).toBe('tp3_hit');
      expect(result.newSl).toBe(5020); // TP2
      expect(result.shouldClose).toBe(false);
    });

    it('SL breach from active (price rises above SL)', () => {
      const pos = shortPos();
      const result = evaluateTrailingStop(pos, 5082); // price at SL

      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('sl_hit_from_active');
    });
  });

  describe('no state change', () => {
    it('returns no change when price is between entry and TP1 (long)', () => {
      const pos = makePosition({ state: 'active', currentSl: 5018 });
      const result = evaluateTrailingStop(pos, 5035); // between entry and TP1

      expect(result.newState).toBeUndefined();
      expect(result.newSl).toBeUndefined();
      expect(result.shouldClose).toBe(false);
    });

    it('returns no change when price is between SL and TP1 (short)', () => {
      const pos = makePosition({
        side: 'short',
        entryPrice: 5080,
        currentSl: 5082,
        tp1Price: 5050,
        tp2Price: 5020,
        tp3Price: 5000,
      });
      const result = evaluateTrailingStop(pos, 5060);

      expect(result.newState).toBeUndefined();
      expect(result.shouldClose).toBe(false);
    });
  });

  describe('inactive states', () => {
    it('returns no change for pending_entry', () => {
      const pos = makePosition({ state: 'pending_entry' });
      const result = evaluateTrailingStop(pos, 5000);

      expect(result.shouldClose).toBe(false);
      expect(result.newState).toBeUndefined();
    });

    it('returns no change for closed', () => {
      const pos = makePosition({ state: 'closed' });
      const result = evaluateTrailingStop(pos, 5000);

      expect(result.shouldClose).toBe(false);
    });

    it('returns no change for cancelled', () => {
      const pos = makePosition({ state: 'cancelled' });
      const result = evaluateTrailingStop(pos, 5000);

      expect(result.shouldClose).toBe(false);
    });
  });
});
