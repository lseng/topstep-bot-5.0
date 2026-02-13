import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionManager } from '../src/bot/position-manager';
import type { PositionManagerConfig } from '../src/bot/position-manager';
import type { AlertRow } from '../src/types/database';
import type { VpvrResult } from '../src/services/vpvr/types';

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

const multiSymbolConfig: PositionManagerConfig = {
  accountId: 1001,
  contractIds: new Map([
    ['MES', 'CON.F.US.MES.H26'],
    ['MNQ', 'CON.F.US.MNQ.H26'],
    ['MYM', 'CON.F.US.MYM.H26'],
  ]),
  symbols: ['MES', 'MNQ', 'MYM'],
  quantity: 1,
  maxContracts: 30,
  maxRetries: 0,
  slBufferTicks: 0,
};

describe('PositionManager multi-symbol', () => {
  let pm: PositionManager;

  beforeEach(() => {
    pm = new PositionManager(multiSymbolConfig);
  });

  it('creates concurrent positions on different symbols', () => {
    const placeOrderSpy = vi.fn();
    pm.on('placeOrder', placeOrderSpy);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    expect(pm.positions.size).toBe(3);
    expect(pm.positions.get('MES')).toBeDefined();
    expect(pm.positions.get('MNQ')).toBeDefined();
    expect(pm.positions.get('MYM')).toBeDefined();
    expect(placeOrderSpy).toHaveBeenCalledTimes(3);
  });

  it('uses correct contractId per symbol', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());

    expect(pm.positions.get('MES')?.contractId).toBe('CON.F.US.MES.H26');
    expect(pm.positions.get('MNQ')?.contractId).toBe('CON.F.US.MNQ.H26');
  });

  it('routes ticks to correct symbol position', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());

    // Simulate fills
    const mesPos = pm.positions.get('MES')!;
    mesPos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    const mnqPos = pm.positions.get('MNQ')!;
    mnqPos.entryOrderId = 101;
    pm.onOrderFill(101, 5080);

    // Send ticks for each symbol
    pm.onTick('MES', 5050, new Date());
    pm.onTick('MNQ', 5060, new Date());

    expect(pm.positions.get('MES')?.lastPrice).toBe(5050);
    expect(pm.positions.get('MNQ')?.lastPrice).toBe(5060);
  });

  it('calculates P&L with correct pointValue per symbol', () => {
    // Create and fill MES position (pointValue = 5.0)
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    const mesPos = pm.positions.get('MES')!;
    mesPos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);

    pm.onTick('MES', 5030, new Date()); // 10 points * $5 * 1 qty = $50
    expect(mesPos.unrealizedPnl).toBeCloseTo(50, 2);
  });

  it('opposing alert replaces only the same-symbol position', () => {
    const closePositionSpy = vi.fn();
    pm.on('closePosition', closePositionSpy);

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'buy' }), makeVpvr());

    // Opposing alert on MES only
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MES', action: 'sell' }), makeVpvr());

    // MES was replaced, MNQ untouched
    expect(pm.positions.get('MES')?.side).toBe('short');
    expect(pm.positions.get('MNQ')?.side).toBe('long');
  });

  it('close alert only closes the specified symbol', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'buy' }), makeVpvr());

    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MES', action: 'close' }), makeVpvr());

    // MNQ should still be active
    expect(pm.positions.get('MNQ')?.state).not.toBe('closed');
    expect(pm.positions.get('MNQ')?.state).not.toBe('cancelled');
  });

  it('getActivePositions returns positions across all symbols', () => {
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    const active = pm.getActivePositions();
    expect(active).toHaveLength(3);
    expect(active.map((p) => p.symbol).sort()).toEqual(['MES', 'MNQ', 'MYM']);
  });
});
