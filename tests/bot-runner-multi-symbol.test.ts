import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig } from '../src/bot/types';

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
  }),
}));

vi.mock('../src/services/topstepx/client', () => ({
  authenticate: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('mock-token'),
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.MES.H26'),
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

const multiConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([
    ['MES', 'CON.F.US.MES.H26'],
    ['MNQ', 'CON.F.US.MNQ.H26'],
    ['MYM', 'CON.F.US.MYM.H26'],
  ]),
  dryRun: true,
  writeIntervalMs: 5000,
  symbols: ['MES', 'MNQ', 'MYM'],
  quantity: 1,
  maxContracts: 30,
  maxRetries: 0,
  slBufferTicks: 0,
};

describe('BotRunner multi-symbol', () => {
  let runner: BotRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new BotRunner(multiConfig);
  });

  it('subscribes to all symbol contracts on start', async () => {
    await runner.start();

    expect(mockSubscribe).toHaveBeenCalledTimes(3);
    expect(mockSubscribe).toHaveBeenCalledWith('CON.F.US.MES.H26');
    expect(mockSubscribe).toHaveBeenCalledWith('CON.F.US.MNQ.H26');
    expect(mockSubscribe).toHaveBeenCalledWith('CON.F.US.MYM.H26');

    await runner.stop();
  });

  it('getStatus includes symbols and contractIds', async () => {
    await runner.start();
    const status = runner.getStatus();

    expect(status.symbols).toEqual(['MES', 'MNQ', 'MYM']);
    expect(status.contractIds).toEqual([
      'CON.F.US.MES.H26',
      'CON.F.US.MNQ.H26',
      'CON.F.US.MYM.H26',
    ]);

    await runner.stop();
  });

  it('exposes position manager with no initial positions', () => {
    expect(runner.positions.getActivePositions()).toHaveLength(0);
  });
});
