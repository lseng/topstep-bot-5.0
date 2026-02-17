import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig } from '../src/bot/types';
import type { AlertRow } from '../src/types/database';

vi.mock('../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockImplementation((cb: (status: string) => void) => {
        cb('SUBSCRIBED');
        return { unsubscribe: vi.fn().mockResolvedValue(undefined) };
      }),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }),
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'pos-1' }, error: null }),
        }),
      }),
    }),
  }),
}));

const mockGetCurrentContractId = vi.fn().mockReturnValue('CON.F.US.MES.H26');
const mockResolveContractId = vi.fn().mockResolvedValue('CON.F.US.MES.H26');

vi.mock('../src/services/topstepx/client', () => ({
  authenticate: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('mock-token'),
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: (...args: unknown[]) => mockGetCurrentContractId(...args),
  resolveContractId: (...args: unknown[]) => mockResolveContractId(...args),
  flattenAccount: vi.fn().mockResolvedValue({ ordersCancelled: 0, positionsClosed: 0 }),
}));

const mockSubscribe = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/services/topstepx/streaming', () => ({
  UserHubConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    onOrderUpdate: null,
    onPositionUpdate: null,
    onAccountUpdate: null,
    onTradeUpdate: null,
  })),
  MarketHubConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: mockSubscribe,
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    onQuote: null,
    onTrade: null,
    onDepth: null,
  })),
}));

vi.mock('../src/services/vpvr/calculator', () => ({
  calculateVpvr: vi.fn().mockReturnValue({
    bins: [], poc: 5050, vah: 5080, val: 5020,
    totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
  }),
}));

vi.mock('../src/services/confirmation/engine', () => ({
  fetchBars: vi.fn().mockResolvedValue([]),
}));

import { BotRunner } from '../src/bot/runner';
import { PositionManager } from '../src/bot/position-manager';
import { CONTRACT_SPECS, getMicroEquivalent } from '../src/services/topstepx/types';
import { parseJsonPayload } from '../src/lib/tradingview-parser';

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

// ─── Dynamic Symbol Resolution ───────────────────────────────────────────────

describe('Dynamic Symbol Handling', () => {
  describe('CONTRACT_SPECS includes NG', () => {
    it('has NG (Natural Gas) in CONTRACT_SPECS', () => {
      expect(CONTRACT_SPECS['NG']).toBeDefined();
      expect(CONTRACT_SPECS['NG'].name).toBe('Natural Gas (Henry Hub)');
      expect(CONTRACT_SPECS['NG'].tickSize).toBe(0.001);
      expect(CONTRACT_SPECS['NG'].pointValue).toBe(10000);
      expect(CONTRACT_SPECS['NG'].expiryCycle).toBe('monthly');
    });

    it('has QG (E-mini Natural Gas) in CONTRACT_SPECS', () => {
      expect(CONTRACT_SPECS['QG']).toBeDefined();
      expect(CONTRACT_SPECS['QG'].expiryCycle).toBe('monthly');
    });

    it('NG contract ID prefix is correct for resolution', () => {
      expect(CONTRACT_SPECS['NG'].contractIdPrefix).toBe('CON.F.US.NGE');
      // Verify the prefix would produce correct contract IDs
      expect(CONTRACT_SPECS['NG'].contractIdPrefix).toMatch(/^CON\.F\.US\.NGE$/);
    });
  });

  describe('NG is in MINI_SYMBOLS (full-size equivalent)', () => {
    it('NG counts as 10 micro-equivalent units', () => {
      expect(getMicroEquivalent('NG', 1)).toBe(10);
    });

    it('QG counts as 1 micro-equivalent unit', () => {
      expect(getMicroEquivalent('QG', 1)).toBe(1);
    });
  });

  describe('BotRunner dynamic symbol resolution on alert', () => {
    let runner: BotRunner;

    const dynamicConfig: BotConfig = {
      accountId: 1001,
      contractIds: new Map(), // Empty - no pre-configured symbols
      dryRun: true,
      writeIntervalMs: 5000,
      symbols: [], // Empty = accept all known symbols
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockGetCurrentContractId.mockReturnValue('CON.F.US.MES.H26');
      runner = new BotRunner(dynamicConfig);
    });

    it('starts without --symbols and has empty contractIds', async () => {
      await runner.start();
      const status = runner.getStatus();
      expect(status.symbols).toEqual([]);
      expect(status.contractIds).toEqual([]);
      await runner.stop();
    });

    it('resolves contract dynamically when alert arrives for known symbol', async () => {
      await runner.start();

      // The alert listener emits 'newAlert' event with SfxEnrichedAlert shape
      const alert = makeAlert({ symbol: 'MES' });

      // Emit the alert via the alert listener (now expects { alert, sfxTpLevels })
      const alertListener = (runner as unknown as { alertListener: { emit: (event: string, data: unknown) => void } }).alertListener;
      alertListener.emit('newAlert', { alert, sfxTpLevels: undefined });

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 50));

      // The runner should have called resolveContractId for MES
      expect(mockResolveContractId).toHaveBeenCalledWith('MES');

      await runner.stop();
    });

    it('skips alert for unknown symbol not in CONTRACT_SPECS', async () => {
      await runner.start();

      const alert = makeAlert({ symbol: 'UNKNOWN_SYMBOL' });

      const alertListener = (runner as unknown as { alertListener: { emit: (event: string, data: unknown) => void } }).alertListener;
      alertListener.emit('newAlert', { alert, sfxTpLevels: undefined });

      await new Promise((r) => setTimeout(r, 50));

      // Should NOT have tried to resolve contract
      expect(mockGetCurrentContractId).not.toHaveBeenCalled();
      // Should not have a position
      expect(runner.positions.getActivePositions()).toHaveLength(0);

      await runner.stop();
    });
  });
});

// ─── Strategy Field ──────────────────────────────────────────────────────────

describe('Strategy Field', () => {
  it('parses strategy from JSON webhook payload', () => {
    const result = parseJsonPayload(JSON.stringify({
      secret: 'test-secret',
      ticker: 'MES',
      action: 'buy',
      quantity: 1,
      strategy: 'vpvr',
    }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.strategy).toBe('vpvr');
    }
  });

  it('strategy defaults to undefined when not provided', () => {
    const result = parseJsonPayload(JSON.stringify({
      secret: 'test-secret',
      ticker: 'MES',
      action: 'buy',
      quantity: 1,
    }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.strategy).toBeUndefined();
    }
  });

  it('strategy is set on ManagedPosition from alert raw_payload', () => {
    const pm = new PositionManager({
      accountId: 1001,
      contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
      symbols: ['MES'],
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    });

    const alert = makeAlert({
      symbol: 'MES',
      action: 'buy',
      strategy: 'vpvr',
      raw_payload: { strategy: 'vpvr' },
    });

    const vpvr = {
      bins: [], poc: 5050, vah: 5080, val: 5020,
      totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
    };

    pm.onAlert(alert, vpvr);

    const pos = pm.positions.get('MES');
    expect(pos).toBeDefined();
    expect(pos!.strategy).toBe('vpvr');
  });

  it('strategy defaults to vpvr when not in alert', () => {
    const pm = new PositionManager({
      accountId: 1001,
      contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
      symbols: ['MES'],
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    });

    const alert = makeAlert({ symbol: 'MES', action: 'buy' });

    const vpvr = {
      bins: [], poc: 5050, vah: 5080, val: 5020,
      totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
    };

    pm.onAlert(alert, vpvr);

    const pos = pm.positions.get('MES');
    expect(pos).toBeDefined();
    expect(pos!.strategy).toBe('vpvr');
  });

  it('strategy from alert.strategy takes precedence over raw_payload', () => {
    const pm = new PositionManager({
      accountId: 1001,
      contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
      symbols: ['MES'],
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    });

    const alert = makeAlert({
      symbol: 'MES',
      action: 'buy',
      strategy: 'scalper',
      raw_payload: { strategy: 'vpvr' },
    });

    const vpvr = {
      bins: [], poc: 5050, vah: 5080, val: 5020,
      totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
    };

    pm.onAlert(alert, vpvr);

    const pos = pm.positions.get('MES');
    expect(pos!.strategy).toBe('scalper');
  });
});

// ─── EOD Liquidation State Transition ────────────────────────────────────────

describe('eod_liquidation state transition', () => {
  it('position can be closed with eod_liquidation reason', () => {
    const pm = new PositionManager({
      accountId: 1001,
      contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
      symbols: ['MES'],
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    });

    const alert = makeAlert({ symbol: 'MES', action: 'buy' });
    pm.onAlert(alert, {
      bins: [], poc: 5050, vah: 5080, val: 5020,
      totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
    });

    const pos = pm.positions.get('MES')!;
    pos.entryOrderId = 100;
    pm.onOrderFill(100, 5020);
    expect(pos.state).toBe('active');

    const closedHandler = vi.fn();
    pm.on('positionClosed', closedHandler);

    pm.onClose('MES', 5030, 'eod_liquidation');

    expect(pos.state).toBe('closed');
    expect(pos.exitReason).toBe('eod_liquidation');
    expect(closedHandler).toHaveBeenCalledTimes(1);
    expect(closedHandler.mock.calls[0][0].exitReason).toBe('eod_liquidation');
  });

  it('pending_entry position is closed with eod_liquidation', () => {
    const pm = new PositionManager({
      accountId: 1001,
      contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
      symbols: ['MES'],
      quantity: 1,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
    });

    const alert = makeAlert({ symbol: 'MES', action: 'buy' });
    pm.onAlert(alert, {
      bins: [], poc: 5050, vah: 5080, val: 5020,
      totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
    });

    const pos = pm.positions.get('MES')!;
    expect(pos.state).toBe('pending_entry');

    pm.onClose('MES', 0, 'eod_liquidation');

    expect(pos.state).toBe('closed');
    expect(pos.exitReason).toBe('eod_liquidation');
  });
});
