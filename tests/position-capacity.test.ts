import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionManager } from '../src/bot/position-manager';
import type { PositionManagerConfig } from '../src/bot/position-manager';
import type { AlertRow } from '../src/types/database';
import type { VpvrResult } from '../src/services/vpvr/types';
import { getMicroEquivalent, MINI_SYMBOLS } from '../src/services/topstepx/types';
import { simulateBatch } from '../src/bot/backtest/simulator';

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
    strategy: null,
    ...overrides,
  };
}

function makeBars() {
  return [
    { t: '2026-01-15T09:30:00Z', o: 5025, h: 5030, l: 5015, c: 5020, v: 1000 },
    { t: '2026-01-15T09:35:00Z', o: 5020, h: 5025, l: 5018, c: 5022, v: 800 },
    { t: '2026-01-15T09:40:00Z', o: 5022, h: 5055, l: 5020, c: 5050, v: 1200 },
    { t: '2026-01-15T09:45:00Z', o: 5050, h: 5085, l: 5048, c: 5080, v: 900 },
    { t: '2026-01-15T09:50:00Z', o: 5080, h: 5105, l: 5078, c: 5100, v: 1100 },
    { t: '2026-01-15T09:55:00Z', o: 5100, h: 5102, l: 5070, c: 5075, v: 700 },
  ];
}

// ─── getMicroEquivalent tests ─────────────────────────────────────────────────

describe('getMicroEquivalent', () => {
  it('returns 10 per contract for mini symbols (ES, NQ)', () => {
    expect(getMicroEquivalent('ES', 1)).toBe(10);
    expect(getMicroEquivalent('NQ', 1)).toBe(10);
    expect(getMicroEquivalent('ES', 3)).toBe(30);
    expect(getMicroEquivalent('NQ', 2)).toBe(20);
  });

  it('returns 1 per contract for micro symbols', () => {
    expect(getMicroEquivalent('MES', 1)).toBe(1);
    expect(getMicroEquivalent('MNQ', 1)).toBe(1);
    expect(getMicroEquivalent('MYM', 1)).toBe(1);
    expect(getMicroEquivalent('MGC', 1)).toBe(1);
    expect(getMicroEquivalent('MCL', 1)).toBe(1);
    expect(getMicroEquivalent('MBT', 1)).toBe(1);
  });

  it('scales with quantity for micros', () => {
    expect(getMicroEquivalent('MES', 5)).toBe(5);
    expect(getMicroEquivalent('MNQ', 10)).toBe(10);
  });

  it('MINI_SYMBOLS contains ES and NQ', () => {
    expect(MINI_SYMBOLS.has('ES')).toBe(true);
    expect(MINI_SYMBOLS.has('NQ')).toBe(true);
    expect(MINI_SYMBOLS.has('MES')).toBe(false);
  });
});

// ─── PositionManager capacity tracking ────────────────────────────────────────

describe('PositionManager capacity tracking', () => {
  const configWith3Micros: PositionManagerConfig = {
    accountId: 1001,
    contractIds: new Map([
      ['MES', 'CON.F.US.MES.H26'],
      ['MNQ', 'CON.F.US.MNQ.H26'],
      ['MYM', 'CON.F.US.MYM.H26'],
      ['MGC', 'CON.F.US.MGC.H26'],
    ]),
    symbols: ['MES', 'MNQ', 'MYM', 'MGC'],
    quantity: 1,
    maxContracts: 3, // Only allow 3 micro-equivalent units
    maxRetries: 0,
    slBufferTicks: 0,
  };

  let pm: PositionManager;

  beforeEach(() => {
    pm = new PositionManager(configWith3Micros);
  });

  it('getCurrentMicroEquivalent returns 0 with no positions', () => {
    expect(pm.getCurrentMicroEquivalent()).toBe(0);
  });

  it('getCurrentMicroEquivalent tracks micro positions correctly', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    expect(pm.getCurrentMicroEquivalent()).toBe(1);

    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    expect(pm.getCurrentMicroEquivalent()).toBe(2);
  });

  it('allows positions up to maxContracts', () => {
    const placeOrderSpy = vi.fn();
    pm.on('placeOrder', placeOrderSpy);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    // 3 micro-equivalent units = capacity limit
    expect(placeOrderSpy).toHaveBeenCalledTimes(3);
    expect(pm.getCurrentMicroEquivalent()).toBe(3);
  });

  it('emits capacityExceeded when at limit and new alert arrives', () => {
    const capacityExceededSpy = vi.fn();
    const placeOrderSpy = vi.fn();
    pm.on('capacityExceeded', capacityExceededSpy);
    pm.on('placeOrder', placeOrderSpy);

    // Fill to capacity
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    // 4th alert should be rejected
    pm.onAlert(makeAlert({ id: 'a4', symbol: 'MGC', action: 'buy' }), makeVpvr());

    expect(placeOrderSpy).toHaveBeenCalledTimes(3);
    expect(capacityExceededSpy).toHaveBeenCalledTimes(1);
    expect(capacityExceededSpy).toHaveBeenCalledWith({
      symbol: 'MGC',
      currentMicroEquivalent: 3,
      maxMicroEquivalent: 3,
      requiredMicroEquivalent: 1,
    });

    // Position should NOT be created for MGC
    expect(pm.positions.has('MGC')).toBe(false);
  });

  it('allows new position after an existing one is closed via onClose', () => {
    const placeOrderSpy = vi.fn();
    pm.on('placeOrder', placeOrderSpy);

    // Fill to capacity
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    // Simulate fill then close on MES — first fill, then close
    const mesPos = pm.positions.get('MES')!;
    mesPos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);
    pm.onClose('MES', 5025, 'manual');

    // Now capacity should be 2/3, MGC should be allowed
    pm.onAlert(makeAlert({ id: 'a4', symbol: 'MGC', action: 'buy' }), makeVpvr());
    expect(placeOrderSpy).toHaveBeenCalledTimes(4);
    expect(pm.positions.has('MGC')).toBe(true);
  });

  it('opposing alert on same symbol frees capacity for the replacement', () => {
    const placeOrderSpy = vi.fn();
    const capacityExceededSpy = vi.fn();
    pm.on('placeOrder', placeOrderSpy);
    pm.on('capacityExceeded', capacityExceededSpy);

    // Fill to capacity
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    // Opposing alert on MES (cancels existing, creates new) — should NOT trigger capacity exceeded
    pm.onAlert(makeAlert({ id: 'a4', symbol: 'MES', action: 'sell' }), makeVpvr());
    expect(capacityExceededSpy).not.toHaveBeenCalled();
    expect(placeOrderSpy).toHaveBeenCalledTimes(4);
    expect(pm.positions.get('MES')?.side).toBe('short');
  });

  it('close actions still work when at capacity', () => {
    const closePositionSpy = vi.fn();
    pm.on('closePosition', closePositionSpy);

    // Fill to capacity and activate positions
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    // Fill MNQ so it becomes active
    const mnqPos = pm.positions.get('MNQ')!;
    mnqPos.entryOrderId = 101;
    pm.onOrderFill(101, 5080);
    expect(mnqPos.state).toBe('active');

    // Close action on MNQ should emit closePosition event regardless of capacity
    pm.onAlert(makeAlert({ id: 'close-mnq', symbol: 'MNQ', action: 'close' }), makeVpvr());

    expect(closePositionSpy).toHaveBeenCalledTimes(1);
    expect(closePositionSpy).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'MNQ',
      reason: 'close_alert',
    }));
  });

  it('tracks mini contracts as 10 micro-equivalent units', () => {
    const miniConfig: PositionManagerConfig = {
      accountId: 1001,
      contractIds: new Map([
        ['ES', 'CON.F.US.EP.H26'],
        ['MES', 'CON.F.US.MES.H26'],
      ]),
      symbols: ['ES', 'MES'],
      quantity: 1,
      maxContracts: 30, // 3 minis or 30 micros
      maxRetries: 0,
      slBufferTicks: 0,
    };

    const miniPm = new PositionManager(miniConfig);
    const placeOrderSpy = vi.fn();
    const capacityExceededSpy = vi.fn();
    miniPm.on('placeOrder', placeOrderSpy);
    miniPm.on('capacityExceeded', capacityExceededSpy);

    // Place 1 ES (mini) = 10 micro-equivalent units
    miniPm.onAlert(makeAlert({ id: 'a1', symbol: 'ES', action: 'buy' }), makeVpvr());
    expect(miniPm.getCurrentMicroEquivalent()).toBe(10);
    expect(placeOrderSpy).toHaveBeenCalledTimes(1);

    // Place 1 MES (micro) = 1 more unit → total 11 → still under 30
    miniPm.onAlert(makeAlert({ id: 'a2', symbol: 'MES', action: 'sell' }), makeVpvr());
    expect(miniPm.getCurrentMicroEquivalent()).toBe(11);
    expect(placeOrderSpy).toHaveBeenCalledTimes(2);
  });

  it('excludes closed and cancelled positions from capacity count', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    expect(pm.getCurrentMicroEquivalent()).toBe(2);

    // Fill MES and then close it via onClose
    const mesPos = pm.positions.get('MES')!;
    mesPos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);
    pm.onClose('MES', 5025, 'manual');

    // Only MNQ is active
    expect(pm.getCurrentMicroEquivalent()).toBe(1);
  });
});

// ─── Backtest batch simulation with capacity ──────────────────────────────────

describe('simulateBatch capacity tracking', () => {
  const vpvr = makeVpvr();
  const bars = makeBars();

  it('allows all trades when maxContracts is 0 (unlimited)', () => {
    const alerts = [
      { alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
    ];

    const result = simulateBatch(alerts, { maxContracts: 0, quantity: 1 });

    expect(result.alertsSkipped).toBe(0);
    expect(result.capacityExceeded).toBe(0);
    expect(result.trades.length).toBe(3);
  });

  it('skips trades when capacity is exceeded', () => {
    const alerts = [
      { alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a4', symbol: 'MGC', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
    ];

    // Only allow 2 micro-equivalent units
    const result = simulateBatch(alerts, { maxContracts: 2, quantity: 1 });

    expect(result.alertsSkipped).toBe(2);
    expect(result.capacityExceeded).toBe(2);
    expect(result.trades.length).toBe(2);
  });

  it('allows trades after prior trades have exited', () => {
    // First alert at 09:30, exits before second alert at 10:30
    const laterBars = [
      { t: '2026-01-15T10:30:00Z', o: 5025, h: 5030, l: 5015, c: 5020, v: 1000 },
      { t: '2026-01-15T10:35:00Z', o: 5020, h: 5025, l: 5018, c: 5022, v: 800 },
      { t: '2026-01-15T10:40:00Z', o: 5022, h: 5055, l: 5020, c: 5050, v: 1200 },
      { t: '2026-01-15T10:45:00Z', o: 5050, h: 5085, l: 5048, c: 5080, v: 900 },
    ];

    const alerts = [
      { alert: makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' as const, created_at: '2026-01-15T09:30:00Z' }), bars, vpvr },
      { alert: makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' as const, created_at: '2026-01-15T10:30:00Z' }), bars: laterBars, vpvr },
    ];

    // Only allow 1 micro-equivalent at a time
    const result = simulateBatch(alerts, { maxContracts: 1, quantity: 1 });

    // First trade exits (bars end at 09:55), second starts at 10:30 — no overlap
    // So both should be allowed
    expect(result.trades.length).toBe(2);
    expect(result.alertsSkipped).toBe(0);
  });
});
