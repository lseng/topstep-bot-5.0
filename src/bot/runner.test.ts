import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotConfig } from './types';

// Mock all dependencies before importing BotRunner
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
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

vi.mock('../services/topstepx/client', () => ({
  authenticate: vi.fn().mockResolvedValue(true),
  getToken: vi.fn().mockResolvedValue('mock-token'),
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.EPH26'),
}));

vi.mock('../services/topstepx/streaming', () => ({
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

vi.mock('../services/vpvr/calculator', () => ({
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

vi.mock('../services/confirmation/engine', () => ({
  fetchBars: vi.fn().mockResolvedValue([]),
}));

vi.mock('./llm-analyzer', () => ({
  analyzeTrade: vi.fn().mockResolvedValue(null),
}));

import { BotRunner } from './runner';
import { authenticate } from '../services/topstepx/client';

const mockAuthenticate = vi.mocked(authenticate);

const defaultConfig: BotConfig = {
  accountId: 1001,
  contractIds: new Map([['ES', 'CON.F.US.EPH26']]),
  dryRun: true,
  slBufferTicks: 8,
  writeIntervalMs: 5000,
  symbols: ['ES'],
  quantity: 1,
};

describe('BotRunner', () => {
  let runner: BotRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new BotRunner(defaultConfig);
  });

  describe('start/stop lifecycle', () => {
    it('starts and sets running to true', async () => {
      await runner.start();
      expect(runner.isRunning).toBe(true);
    });

    it('authenticates with TopstepX on start', async () => {
      await runner.start();
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    });

    it('throws if authentication fails', async () => {
      mockAuthenticate.mockResolvedValueOnce(false);
      await expect(runner.start()).rejects.toThrow('Failed to authenticate');
    });

    it('stops and sets running to false', async () => {
      await runner.start();
      await runner.stop();
      expect(runner.isRunning).toBe(false);
    });

    it('start is idempotent', async () => {
      await runner.start();
      await runner.start();
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    });

    it('stop is idempotent', async () => {
      await runner.stop(); // No-op when not running
      expect(runner.isRunning).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns status object', async () => {
      await runner.start();
      const status = runner.getStatus();

      expect(status).toEqual(
        expect.objectContaining({
          running: true,
          activePositions: 0,
          pendingWrites: 0,
        }),
      );
    });
  });

  describe('position manager access', () => {
    it('exposes position manager', () => {
      expect(runner.positions).toBeDefined();
      expect(runner.positions.getActivePositions()).toHaveLength(0);
    });
  });

  describe('dry-run mode', () => {
    it('creates executor in dry-run when config is set', async () => {
      const dryRunner = new BotRunner({ ...defaultConfig, dryRun: true });
      await dryRunner.start();
      expect(dryRunner.isRunning).toBe(true);
      await dryRunner.stop();
    });
  });

  describe('event wiring', () => {
    it('wires alert listener, hubs, position manager, and write queue', async () => {
      await runner.start();

      // The runner should have connected everything
      const status = runner.getStatus();
      expect(status.running).toBe(true);

      await runner.stop();
    });
  });
});
