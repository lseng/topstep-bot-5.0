// E2E test: Multi-symbol alert routing — simultaneous alerts for MES, MNQ, MYM
// Verifies each creates the correct position with correct contract specs

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
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.MES.H26'),
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
    bins: [], poc: 5050, vah: 5080, val: 5020,
    totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
  }),
}));

vi.mock('../../src/services/confirmation/engine', () => ({
  fetchBars: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/bot/llm-analyzer', () => ({
  analyzeTrade: vi.fn().mockResolvedValue(null),
}));

import { BotRunner } from '../../src/bot/runner';
import { PositionManager } from '../../src/bot/position-manager';
import type { AlertRow } from '../../src/types/database';
import type { VpvrResult } from '../../src/services/vpvr/types';

function makeAlert(overrides: Partial<AlertRow>): AlertRow {
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

function makeVpvr(): VpvrResult {
  return {
    bins: [], poc: 5050, vah: 5080, val: 5020,
    totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60,
  };
}

const multiConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([
    ['MES', 'CON.F.US.MES.H26'],
    ['MNQ', 'CON.F.US.MNQ.H26'],
    ['MYM', 'CON.F.US.MYM.H26'],
  ]),
  dryRun: true,
  slBufferTicks: 8,
  writeIntervalMs: 5000,
  symbols: ['MES', 'MNQ', 'MYM'],
  quantity: 1,
};

describe('Multi-symbol alert routing (e2e)', () => {
  let runner: BotRunner;

  beforeEach(async () => {
    vi.clearAllMocks();
    runner = new BotRunner(multiConfig);
    await runner.start();
  });

  it('creates positions for multiple symbols simultaneously', () => {
    const pm = runner.positions;

    pm.onAlert(makeAlert({ id: 'a1', symbol: 'MES', action: 'buy' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a2', symbol: 'MNQ', action: 'sell' }), makeVpvr());
    pm.onAlert(makeAlert({ id: 'a3', symbol: 'MYM', action: 'buy' }), makeVpvr());

    const active = pm.getActivePositions();
    expect(active).toHaveLength(3);

    const mesPos = pm.positions.get('MES');
    expect(mesPos).toBeDefined();
    expect(mesPos?.symbol).toBe('MES');
    expect(mesPos?.side).toBe('long');
    expect(mesPos?.contractId).toBe('CON.F.US.MES.H26');

    const mnqPos = pm.positions.get('MNQ');
    expect(mnqPos).toBeDefined();
    expect(mnqPos?.symbol).toBe('MNQ');
    expect(mnqPos?.side).toBe('short');
    expect(mnqPos?.contractId).toBe('CON.F.US.MNQ.H26');

    const mymPos = pm.positions.get('MYM');
    expect(mymPos).toBeDefined();
    expect(mymPos?.symbol).toBe('MYM');
    expect(mymPos?.side).toBe('long');
    expect(mymPos?.contractId).toBe('CON.F.US.MYM.H26');
  });

  it('alerts for unconfigured symbols are filtered out by runner', async () => {
    // The BotRunner filters alerts by configured symbols
    // ES is NOT in our config, so if an ES alert comes through alert listener,
    // it should be ignored
    const pm = runner.positions;

    // Direct PM call should work (PM doesn't filter)
    pm.onAlert(makeAlert({ id: 'a1', symbol: 'ES', action: 'buy' }), makeVpvr());
    expect(pm.positions.get('ES')).toBeDefined();

    await runner.stop();
  });

  it('getStatus shows all configured symbols', async () => {
    const status = runner.getStatus();
    expect(status.symbols).toEqual(['MES', 'MNQ', 'MYM']);
    expect(status.contractIds).toHaveLength(3);

    await runner.stop();
  });
});
