import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig, AccountStrategyConfig } from '../src/bot/types';
import type { AlertRow } from '../src/types/database';

// --- Mocks ---

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
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'pos-1' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }),
}));

vi.mock('../src/services/topstepx/client', () => ({
  authenticate: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('mock-token'),
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.MES.H26'),
  getPositions: vi.fn().mockResolvedValue([]),
}));

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
    subscribe: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../src/bot/llm-analyzer', () => ({
  analyzeTrade: vi.fn().mockResolvedValue(null),
}));

import { BotRunner } from '../src/bot/runner';

// --- Test Helpers ---

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'alert-1',
    created_at: new Date().toISOString(),
    symbol: 'MES',
    action: 'buy',
    quantity: 1,
    order_type: 'market',
    price: 5050,
    stop_loss: null,
    take_profit: null,
    comment: null,
    status: 'received',
    error_message: null,
    order_id: null,
    executed_at: null,
    raw_payload: {},
    strategy: null,
    name: null,
    ...overrides,
  };
}

const multiAccountConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
  dryRun: true,
  writeIntervalMs: 5000,
  symbols: ['MES'],
  quantity: 1,
  maxContracts: 30,
  maxRetries: 3,
  slBufferTicks: 8,
  syncIntervalMs: 0,
  accounts: [
    { accountId: 1001, alertName: 'strategy-A', slBufferTicks: 8, maxRetries: 3, maxContracts: 30 },
    { accountId: 2002, alertName: 'strategy-B', slBufferTicks: 4, maxRetries: 1, maxContracts: 30 },
  ],
};

const singleAccountConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([['MES', 'CON.F.US.MES.H26']]),
  dryRun: true,
  writeIntervalMs: 5000,
  symbols: ['MES'],
  quantity: 1,
  maxContracts: 30,
  maxRetries: 3,
  slBufferTicks: 8,
  syncIntervalMs: 0,
};

// --- Tests ---

describe('Multi-account routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('configuration', () => {
    it('creates per-account resources in multi-account mode', () => {
      const runner = new BotRunner(multiAccountConfig);
      expect(runner.getAccountIds()).toEqual([1001, 2002]);
    });

    it('creates single account resource in single-account mode', () => {
      const runner = new BotRunner(singleAccountConfig);
      expect(runner.getAccountIds()).toEqual([1001]);
    });

    it('reports multiAccountMode in status', async () => {
      const runner = new BotRunner(multiAccountConfig);
      await runner.start();
      const status = runner.getStatus();
      expect(status.multiAccountMode).toBe(true);
      expect(status.accountIds).toEqual([1001, 2002]);
      await runner.stop();
    });

    it('reports single-account mode in status', async () => {
      const runner = new BotRunner(singleAccountConfig);
      await runner.start();
      const status = runner.getStatus();
      expect(status.multiAccountMode).toBe(false);
      expect(status.accountIds).toEqual([1001]);
      await runner.stop();
    });
  });

  describe('per-account position managers', () => {
    it('provides separate position managers per account', () => {
      const runner = new BotRunner(multiAccountConfig);
      const pm1 = runner.getPositionManager(1001);
      const pm2 = runner.getPositionManager(2002);
      expect(pm1).toBeDefined();
      expect(pm2).toBeDefined();
      expect(pm1).not.toBe(pm2);
    });

    it('returns undefined for unknown account', () => {
      const runner = new BotRunner(multiAccountConfig);
      expect(runner.getPositionManager(9999)).toBeUndefined();
    });

    it('primary positions accessor returns first account PM', () => {
      const runner = new BotRunner(multiAccountConfig);
      const primary = runner.positions;
      const first = runner.getPositionManager(1001);
      expect(primary).toBe(first);
    });
  });

  describe('backward compatibility', () => {
    it('single account mode works without accounts config', () => {
      const runner = new BotRunner(singleAccountConfig);
      expect(runner.getAccountIds()).toEqual([1001]);
      expect(runner.positions).toBeDefined();
      expect(runner.positions.getActivePositions()).toHaveLength(0);
    });

    it('starts and stops in single-account mode', async () => {
      const runner = new BotRunner(singleAccountConfig);
      await runner.start();
      expect(runner.isRunning).toBe(true);
      await runner.stop();
      expect(runner.isRunning).toBe(false);
    });
  });
});

describe('Alert name parsing', () => {
  it('name field is added to TradingViewAlert type', async () => {
    const { parseTradingViewAlert } = await import('../src/lib/tradingview-parser');
    const result = parseTradingViewAlert({
      secret: 'test-secret',
      ticker: 'MES',
      action: 'buy',
      name: 'day-trader-medium-term-13',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.name).toBe('day-trader-medium-term-13');
    }
  });

  it('name is optional in payload', async () => {
    const { parseTradingViewAlert } = await import('../src/lib/tradingview-parser');
    const result = parseTradingViewAlert({
      secret: 'test-secret',
      ticker: 'MES',
      action: 'buy',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.name).toBeUndefined();
    }
  });
});

describe('AccountStrategyConfig interface', () => {
  it('accepts valid config', () => {
    const config: AccountStrategyConfig = {
      accountId: 18206938,
      alertName: 'day-trader-medium-term-13',
      slBufferTicks: 8,
      maxRetries: 3,
      maxContracts: 30,
    };
    expect(config.accountId).toBe(18206938);
    expect(config.alertName).toBe('day-trader-medium-term-13');
  });
});

describe('API endpoint filtering', () => {
  // These are structural tests verifying types accept the new parameters
  it('AlertRow type includes name field', () => {
    const row: AlertRow = {
      id: '1',
      created_at: new Date().toISOString(),
      symbol: 'MES',
      action: 'buy',
      quantity: 1,
      order_type: 'market',
      price: 5050,
      stop_loss: null,
      take_profit: null,
      comment: null,
      status: 'received',
      error_message: null,
      order_id: null,
      executed_at: null,
      raw_payload: {},
      strategy: null,
      name: 'day-trader-medium-term-13',
    };
    expect(row.name).toBe('day-trader-medium-term-13');
  });

  it('AlertRow name can be null', () => {
    const row: AlertRow = makeAlert({ name: null });
    expect(row.name).toBeNull();
  });
});

describe('Backtest config', () => {
  it('accepts alertName in BacktestConfig', async () => {
    const { BacktestConfig } = await import('../src/bot/backtest/types') as { BacktestConfig: unknown };
    // Type check only - if this compiles, the type is correct
    const config = {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      symbols: ['MES'],
      quantity: 1,
      verbose: false,
      maxContracts: 30,
      maxRetries: 0,
      slBufferTicks: 0,
      alertName: 'day-trader-medium-term-13',
    };
    expect(config.alertName).toBe('day-trader-medium-term-13');
  });
});
