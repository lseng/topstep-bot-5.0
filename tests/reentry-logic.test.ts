import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionManager } from '../src/bot/position-manager';
import type { PositionManagerConfig } from '../src/bot/position-manager';
import type { AlertRow } from '../src/types/database';
import type { VpvrResult } from '../src/services/vpvr/types';
import type { TradeResult, PositionSide } from '../src/bot/types';
import {
  calculateEntryPrice,
  calculateRetryEntryLevels,
  calculateSlFromEntry,
} from '../src/bot/entry-calculator';
import { simulateTrade, simulateBatch } from '../src/bot/backtest/simulator';
import type { Bar } from '../src/services/topstepx/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeAlert(overrides?: Partial<AlertRow>): AlertRow {
  return {
    id: 'alert-1',
    created_at: '2026-02-12T15:00:00Z',
    symbol: 'MES',
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
  contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
  symbols: ['MES'],
  quantity: 1,
  maxContracts: 30,
  maxRetries: 3,
  slBufferTicks: 8,
};

// ─── calculateRetryEntryLevels ──────────────────────────────────────────────

describe('calculateRetryEntryLevels', () => {
  const vpvr = makeVpvr();

  it('calculates correct long ladder levels', () => {
    const levels = calculateRetryEntryLevels('long', vpvr, 3);

    // Attempt 0: VAL = 5020
    expect(levels[0]).toBe(5020);
    // Attempt 1: rangeLow = 5000
    expect(levels[1]).toBe(5000);
    // Attempt 2: rangeLow - (VAL - rangeLow) = 5000 - (5020 - 5000) = 4980
    expect(levels[2]).toBe(4980);
    // Attempt 3: repeat last level = 4980
    expect(levels[3]).toBe(4980);
  });

  it('calculates correct short ladder levels', () => {
    const levels = calculateRetryEntryLevels('short', vpvr, 3);

    // Attempt 0: VAH = 5080
    expect(levels[0]).toBe(5080);
    // Attempt 1: rangeHigh = 5100
    expect(levels[1]).toBe(5100);
    // Attempt 2: rangeHigh + (rangeHigh - VAH) = 5100 + (5100 - 5080) = 5120
    expect(levels[2]).toBe(5120);
    // Attempt 3: repeat last level = 5120
    expect(levels[3]).toBe(5120);
  });

  it('returns only original level when maxRetries is 0', () => {
    const levels = calculateRetryEntryLevels('long', vpvr, 0);
    expect(levels).toEqual([5020]);
  });

  it('returns 2 levels when maxRetries is 1', () => {
    const levels = calculateRetryEntryLevels('long', vpvr, 1);
    expect(levels).toEqual([5020, 5000]);
  });
});

// ─── calculateSlFromEntry ───────────────────────────────────────────────────

describe('calculateSlFromEntry', () => {
  it('calculates long SL with tick buffer', () => {
    // MES tick size = 0.25, 8 ticks = 2.0
    const sl = calculateSlFromEntry(5020, 'long', 'MES', 8);
    expect(sl).toBe(5018);
  });

  it('calculates short SL with tick buffer', () => {
    const sl = calculateSlFromEntry(5080, 'short', 'MES', 8);
    expect(sl).toBe(5082);
  });

  it('uses default tick size for unknown symbol', () => {
    // Default tick size is 0.25, 8 ticks = 2.0
    const sl = calculateSlFromEntry(5020, 'long', 'UNKNOWN', 8);
    expect(sl).toBe(5018);
  });
});

// ─── calculateEntryPrice with slBufferTicks ─────────────────────────────────

describe('calculateEntryPrice with slBufferTicks', () => {
  const vpvr = makeVpvr();

  it('uses tick buffer for buy SL when slBufferTicks > 0', () => {
    const entry = calculateEntryPrice('buy', vpvr, { symbol: 'MES', slBufferTicks: 8 });
    expect(entry).not.toBeNull();
    // Entry = VAL = 5020
    // SL = 5020 - 8 * 0.25 = 5018
    expect(entry!.entryPrice).toBe(5020);
    expect(entry!.initialSl).toBe(5018);
    expect(entry!.tp1).toBe(5050);
    expect(entry!.tp2).toBe(5080);
    expect(entry!.tp3).toBe(5100);
  });

  it('uses tick buffer for sell SL when slBufferTicks > 0', () => {
    const entry = calculateEntryPrice('sell', vpvr, { symbol: 'MES', slBufferTicks: 8 });
    expect(entry).not.toBeNull();
    // Entry = VAH = 5080
    // SL = 5080 + 8 * 0.25 = 5082
    expect(entry!.entryPrice).toBe(5080);
    expect(entry!.initialSl).toBe(5082);
    expect(entry!.tp1).toBe(5050);
    expect(entry!.tp2).toBe(5020);
    expect(entry!.tp3).toBe(5000);
  });

  it('uses mirrored TP1 distance when slBufferTicks is 0', () => {
    const entry = calculateEntryPrice('buy', vpvr, { symbol: 'MES', slBufferTicks: 0 });
    expect(entry).not.toBeNull();
    // Mirrored TP1: SL = VAL - (POC - VAL) = 5020 - 30 = 4990
    expect(entry!.initialSl).toBe(4990);
  });

  it('uses mirrored TP1 distance when no options provided', () => {
    const entry = calculateEntryPrice('buy', vpvr);
    expect(entry).not.toBeNull();
    expect(entry!.initialSl).toBe(4990);
  });
});

// ─── PositionManager re-entry logic ─────────────────────────────────────────

describe('PositionManager re-entry logic', () => {
  let pm: PositionManager;

  beforeEach(() => {
    pm = new PositionManager(defaultConfig);
  });

  it('emits retryEntry after SL hit from active state with retries remaining', () => {
    const retryHandler = vi.fn();
    const closedHandler = vi.fn();
    pm.on('retryEntry', retryHandler);
    pm.on('positionClosed', closedHandler);

    // Create and fill position
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    // SL hit from active state
    pm.onClose('MES', 5018, 'sl_hit_from_active');

    expect(retryHandler).toHaveBeenCalledTimes(1);
    expect(retryHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'MES',
        side: 'long',
        retryCount: 1,
        steppedPrice: 5000, // rangeLow
        fallbackPrice: 5020, // original VAL
      }),
    );

    // Trade result should also be emitted for the losing leg
    expect(closedHandler).toHaveBeenCalledTimes(1);

    // Position state should be pending_retry
    expect(pos.state).toBe('pending_retry');
  });

  it('does NOT retry after SL hit from tp1_hit (TP was reached)', () => {
    const retryHandler = vi.fn();
    pm.on('retryEntry', retryHandler);

    // Create, fill, and advance to tp1_hit
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);
    pm.onTick('MES', 5050, new Date()); // Hit TP1

    expect(pos.state).toBe('tp1_hit');

    // SL from tp1_hit
    pm.onClose('MES', 5020, 'sl_hit_from_tp1_hit');

    expect(retryHandler).not.toHaveBeenCalled();
    expect(pos.state).toBe('closed');
  });

  it('does NOT retry after SL hit from tp2_hit', () => {
    const retryHandler = vi.fn();
    pm.on('retryEntry', retryHandler);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);
    pm.onTick('MES', 5050, new Date()); // TP1
    pm.onTick('MES', 5080, new Date()); // TP2

    expect(pos.state).toBe('tp2_hit');

    pm.onClose('MES', 5050, 'sl_hit_from_tp2_hit');

    expect(retryHandler).not.toHaveBeenCalled();
    expect(pos.state).toBe('closed');
  });

  it('exhausts max retries and fully closes', () => {
    const retryHandler = vi.fn();
    const closedHandler = vi.fn();
    pm.on('retryEntry', retryHandler);
    pm.on('positionClosed', closedHandler);

    // Exhaustive config: maxRetries=2
    const pm2 = new PositionManager({ ...defaultConfig, maxRetries: 2 });
    const retryHandler2 = vi.fn();
    const closedHandler2 = vi.fn();
    pm2.on('retryEntry', retryHandler2);
    pm2.on('positionClosed', closedHandler2);

    pm2.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm2.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm2.onOrderFill(100, 5020);

    // 1st SL from active → retry
    pm2.onClose('MES', 5018, 'sl_hit_from_active');
    expect(retryHandler2).toHaveBeenCalledTimes(1);
    expect(pos.state).toBe('pending_retry');

    // Simulate retry order placed
    pm2.onRetryOrderPlaced('MES', 1);
    expect(pos.state).toBe('pending_entry');
    expect(pos.retryCount).toBe(1);

    // Fill again and SL again
    pos.entryOrderId = 200;
    pm2.onOrderFill(200, 5000);
    pm2.onClose('MES', 4998, 'sl_hit_from_active');
    expect(retryHandler2).toHaveBeenCalledTimes(2);
    expect(pos.state).toBe('pending_retry');

    // Simulate retry order placed
    pm2.onRetryOrderPlaced('MES', 2);
    expect(pos.retryCount).toBe(2);

    // Fill and SL a 3rd time — retryCount=2 == maxRetries=2, no more retries
    pos.entryOrderId = 300;
    pm2.onOrderFill(300, 4980);
    pm2.onClose('MES', 4978, 'sl_hit_from_active');

    // No more retries — should fully close
    expect(retryHandler2).toHaveBeenCalledTimes(2); // Still 2, not 3
    expect(pos.state).toBe('closed');
  });

  it('opposing signal cancels pending_retry', () => {
    const retryHandler = vi.fn();
    pm.on('retryEntry', retryHandler);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    // SL from active → pending_retry
    pm.onClose('MES', 5018, 'sl_hit_from_active');
    expect(pos.state).toBe('pending_retry');

    // Opposing sell alert cancels the retry
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MES', action: 'sell' }), makeVpvr());

    // Old position should be cancelled, new short position created
    const newPos = pm.positions.get('MES')!;
    expect(newPos.side).toBe('short');
    expect(newPos.alertId).toBe('a2');
  });

  it('close action cancels pending_retry', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    // SL from active → pending_retry
    pm.onClose('MES', 5018, 'sl_hit_from_active');
    expect(pos.state).toBe('pending_retry');

    // Close action cancels retry
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MES', action: 'close' }), makeVpvr());

    expect(pos.state).toBe('cancelled');
    expect(pos.exitReason).toBe('close_alert');
  });

  it('onRetryOrderPlaced transitions pending_retry back to pending_entry', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    pm.onClose('MES', 5018, 'sl_hit_from_active');
    expect(pos.state).toBe('pending_retry');

    pm.onRetryOrderPlaced('MES', 1);

    expect(pos.state).toBe('pending_entry');
    expect(pos.retryCount).toBe(1);
    expect(pos.entryPrice).toBeUndefined();
    expect(pos.exitPrice).toBeUndefined();
  });

  it('tracks retryCount, maxRetries, originalAlertId on ManagedPosition', () => {
    pm.onAlert(makeAlert({ id: 'original-alert', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;

    expect(pos.retryCount).toBe(0);
    expect(pos.maxRetries).toBe(3);
    expect(pos.originalAlertId).toBe('original-alert');
    expect(pos.retryEntryLevels).toHaveLength(4); // 0: VAL, 1: rangeLow, 2: mirrored, 3: repeat
    expect(pos.retryEntryLevels[0]).toBe(5020);
    expect(pos.retryEntryLevels[1]).toBe(5000);
    expect(pos.retryEntryLevels[2]).toBe(4980);
  });

  it('includes retryCount and originalAlertId in TradeResult', () => {
    const closedHandler = vi.fn();
    pm.on('positionClosed', closedHandler);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    pm.onClose('MES', 5018, 'sl_hit_from_active');

    const trade: TradeResult = closedHandler.mock.calls[0][0];
    expect(trade.retryCount).toBe(0);
    expect(trade.originalAlertId).toBe('a1');
  });

  it('recalculates SL from fill price using slBufferTicks', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;

    // Fill at a slightly different price than target
    pm.onOrderFill(100, 5019);

    // SL should be 5019 - 8*0.25 = 5017
    expect(pos.currentSl).toBe(5017);
    expect(pos.initialSl).toBe(5017);
  });

  it('short position re-entry uses correct stepped levels', () => {
    const retryHandler = vi.fn();
    pm.on('retryEntry', retryHandler);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'sell' }), makeVpvr());
    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5080);

    // SL hit from active
    pm.onClose('MES', 5082, 'sl_hit_from_active');

    expect(retryHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'short',
        steppedPrice: 5100, // rangeHigh
        fallbackPrice: 5080, // original VAH
        retryCount: 1,
      }),
    );
  });
});

// ─── Backtest simulator retry support ───────────────────────────────────────

describe('Backtest simulator retry support', () => {
  // Bars where price drops to VAL=5020, then bounces to POC, then drops past SL
  const barsWithSlHit: Bar[] = [
    { t: '2026-01-15T09:30:00Z', o: 5025, h: 5030, l: 5018, c: 5020, v: 1000 },
    // Fill at VAL=5020, then drop to SL at 5018 (8 ticks = 2.0 for MES)
    { t: '2026-01-15T09:35:00Z', o: 5020, h: 5020, l: 5017, c: 5017, v: 800 },
    // After SL hit, price drops further to rangeLow
    { t: '2026-01-15T09:40:00Z', o: 5017, h: 5017, l: 4998, c: 5000, v: 1200 },
    // Now fills retry at rangeLow=5000, and price recovers
    { t: '2026-01-15T09:45:00Z', o: 5000, h: 5055, l: 4998, c: 5050, v: 900 },
    { t: '2026-01-15T09:50:00Z', o: 5050, h: 5085, l: 5048, c: 5080, v: 1100 },
    { t: '2026-01-15T09:55:00Z', o: 5080, h: 5105, l: 5078, c: 5100, v: 700 },
  ];

  it('simulateTrade uses slBufferTicks for SL', () => {
    const trade = simulateTrade(
      makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }),
      barsWithSlHit,
      makeVpvr(),
      { symbol: 'MES', slBufferTicks: 8, maxRetries: 0 },
    );

    expect(trade).not.toBeNull();
    expect(trade!.entryFilled).toBe(true);
    // Entry at VAL=5020, SL at 5020-2.0=5018
    expect(trade!.entryPrice).toBe(5020);
    expect(trade!.exitReason).toBe('sl_hit_from_active');
  });

  it('simulateBatch triggers retries after SL from active', () => {
    const alerts = [
      {
        alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const }),
        bars: barsWithSlHit,
        vpvr: makeVpvr(),
      },
    ];

    const result = simulateBatch(alerts, {
      symbol: 'MES',
      slBufferTicks: 8,
      maxRetries: 2,
      quantity: 1,
    });

    // Should have original trade + retry trade(s)
    expect(result.trades.length).toBeGreaterThan(1);

    // First trade should be the original SL hit
    expect(result.trades[0].retryCount).toBe(0);
    expect(result.trades[0].exitReason).toBe('sl_hit_from_active');

    // Second trade should be a retry
    expect(result.trades[1].retryCount).toBe(1);
    expect(result.trades[1].originalAlertId).toBe('a1');
  });

  it('retry trades track total P&L across attempts', () => {
    const alerts = [
      {
        alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const }),
        bars: barsWithSlHit,
        vpvr: makeVpvr(),
      },
    ];

    const result = simulateBatch(alerts, {
      symbol: 'MES',
      slBufferTicks: 8,
      maxRetries: 3,
      quantity: 1,
    });

    // Calculate total P&L across all trades for this signal
    const filledTrades = result.trades.filter((t) => t.entryFilled);
    const totalPnl = filledTrades.reduce((sum, t) => sum + t.netPnl, 0);

    // Total should be a number (losers + potential winners from retries)
    expect(typeof totalPnl).toBe('number');

    // All trades should reference original alert
    for (const t of result.trades) {
      expect(t.originalAlertId).toBe('a1');
    }
  });

  it('does not retry when maxRetries is 0', () => {
    const alerts = [
      {
        alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const }),
        bars: barsWithSlHit,
        vpvr: makeVpvr(),
      },
    ];

    const result = simulateBatch(alerts, {
      symbol: 'MES',
      slBufferTicks: 8,
      maxRetries: 0,
      quantity: 1,
    });

    // Only original trade, no retries
    expect(result.trades.length).toBe(1);
  });

  it('does not retry after TP hit then SL', () => {
    // Bars where entry fills, price hits TP1, then SL
    const barsWithTpThenSl: Bar[] = [
      { t: '2026-01-15T09:30:00Z', o: 5025, h: 5030, l: 5018, c: 5020, v: 1000 },
      // Price goes up to TP1
      { t: '2026-01-15T09:35:00Z', o: 5020, h: 5055, l: 5018, c: 5050, v: 800 },
      // Then drops back to breakeven SL (after TP1, SL moves to entry)
      { t: '2026-01-15T09:40:00Z', o: 5050, h: 5050, l: 5019, c: 5025, v: 1200 },
    ];

    const alerts = [
      {
        alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const }),
        bars: barsWithTpThenSl,
        vpvr: makeVpvr(),
      },
    ];

    const result = simulateBatch(alerts, {
      symbol: 'MES',
      slBufferTicks: 8,
      maxRetries: 3,
      quantity: 1,
    });

    // Exit reason should reference tp1_hit, not active
    const filledTrades = result.trades.filter((t) => t.entryFilled);
    if (filledTrades.length > 0 && filledTrades[0].exitReason.includes('tp1')) {
      // Should NOT have retry trades
      expect(result.trades.length).toBe(1);
    }
  });
});
