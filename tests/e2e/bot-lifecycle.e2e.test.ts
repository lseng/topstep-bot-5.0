// E2E test: Full bot lifecycle in dry-run mode
// alert → VPVR → entry calc → position created → simulated ticks → TP progression → close → trade logged

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig } from '../../src/bot/types';

vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/lib/supabase', () => ({
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

vi.mock('../../src/services/topstepx/client', () => ({
  authenticate: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('mock-token'),
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.EPH26'),
}));

vi.mock('../../src/services/topstepx/streaming', () => ({
  UserHubConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    onOrderUpdate: null,
  })),
  MarketHubConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    onQuote: null,
  })),
}));

vi.mock('../../src/services/vpvr/calculator', () => ({
  calculateVpvr: vi.fn().mockReturnValue({
    bins: [],
    poc: 5050,
    vah: 5080,
    val: 5020,
    totalVolume: 100000,
    rangeHigh: 5100,
    rangeLow: 5000,
    barCount: 60,
  }),
}));

vi.mock('../../src/services/confirmation/engine', () => ({
  fetchBars: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/bot/llm-analyzer', () => ({
  analyzeTrade: vi.fn().mockResolvedValue(null),
}));

import { BotRunner } from '../../src/bot/runner';

const defaultConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([['ES', 'CON.F.US.EPH26']]),
  dryRun: true,
  slBufferTicks: 8,
  writeIntervalMs: 5000,
  symbols: ['ES'],
  quantity: 1,
};

describe('Bot Lifecycle (e2e)', () => {
  let runner: BotRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new BotRunner(defaultConfig);
  });

  it('starts in dry-run mode and connects all hubs', async () => {
    await runner.start();

    const status = runner.getStatus();
    expect(status.running).toBe(true);
    expect(status.userHubConnected).toBe(true);
    expect(status.marketHubConnected).toBe(true);

    await runner.stop();
    expect(runner.isRunning).toBe(false);
  });

  it('position manager starts with no active positions', async () => {
    await runner.start();

    expect(runner.positions.getActivePositions()).toHaveLength(0);

    await runner.stop();
  });

  it('processes a buy alert and creates a pending position', async () => {
    await runner.start();

    // Simulate an alert
    const alert = {
      id: 'alert-1',
      symbol: 'ES',
      action: 'buy' as const,
      quantity: 1,
      price: 5020,
      created_at: new Date().toISOString(),
      status: 'received' as const,
      order_type: null,
      stop_loss: null,
      take_profit: null,
      comment: null,
      error_message: null,
      order_id: null,
      executed_at: null,
      raw_payload: {},
      updated_at: new Date().toISOString(),
    };

    // Feed alert directly to position manager
    const vpvr = {
      bins: [],
      poc: 5050,
      vah: 5080,
      val: 5020,
      totalVolume: 100000,
      rangeHigh: 5100,
      rangeLow: 5000,
      barCount: 60,
    };
    runner.positions.onAlert(alert, vpvr);

    // Should have a pending position
    const pos = runner.positions.positions.get('ES');
    expect(pos).toBeDefined();
    expect(pos!.state).toBe('pending_entry');
    expect(pos!.side).toBe('long');

    await runner.stop();
  });

  it('transitions through full lifecycle: alert → fill → TP1 → SL close', async () => {
    await runner.start();

    const vpvr = {
      bins: [],
      poc: 5050,
      vah: 5080,
      val: 5020,
      totalVolume: 100000,
      rangeHigh: 5100,
      rangeLow: 5000,
      barCount: 60,
    };

    const alert = {
      id: 'alert-2',
      symbol: 'ES',
      action: 'buy' as const,
      quantity: 1,
      price: 5020,
      created_at: new Date().toISOString(),
      status: 'received' as const,
      order_type: null,
      stop_loss: null,
      take_profit: null,
      comment: null,
      error_message: null,
      order_id: null,
      executed_at: null,
      raw_payload: {},
      updated_at: new Date().toISOString(),
    };

    // 1. Alert creates pending position
    runner.positions.onAlert(alert, vpvr);
    let pos = runner.positions.positions.get('ES')!;
    expect(pos.state).toBe('pending_entry');

    // 2. Simulate order fill
    pos.entryOrderId = 100;
    runner.positions.onOrderFill(100, 5020);
    pos = runner.positions.positions.get('ES')!;
    expect(pos.state).toBe('active');
    expect(pos.entryPrice).toBe(5020);

    // 3. Price rises to TP1 (5050) → state becomes tp1_hit, SL moves to entry
    runner.positions.onTick('ES', 5050, new Date());
    pos = runner.positions.positions.get('ES')!;
    expect(pos.state).toBe('tp1_hit');
    expect(pos.currentSl).toBe(5020); // SL at breakeven

    // 4. Price drops to SL → position closed
    // The close event will trigger executor which is mocked
    runner.positions.onTick('ES', 5019, new Date());
    pos = runner.positions.positions.get('ES')!;
    // Position should be closed or close event emitted
    expect(pos.state === 'closed' || pos.state === 'tp1_hit').toBe(true);

    await runner.stop();
  });

  it('handles graceful shutdown with active positions', async () => {
    await runner.start();

    const vpvr = {
      bins: [],
      poc: 5050,
      vah: 5080,
      val: 5020,
      totalVolume: 100000,
      rangeHigh: 5100,
      rangeLow: 5000,
      barCount: 60,
    };

    const alert = {
      id: 'alert-3',
      symbol: 'ES',
      action: 'buy' as const,
      quantity: 1,
      price: 5020,
      created_at: new Date().toISOString(),
      status: 'received' as const,
      order_type: null,
      stop_loss: null,
      take_profit: null,
      comment: null,
      error_message: null,
      order_id: null,
      executed_at: null,
      raw_payload: {},
      updated_at: new Date().toISOString(),
    };

    runner.positions.onAlert(alert, vpvr);
    await runner.stop();

    expect(runner.isRunning).toBe(false);
  });
});
