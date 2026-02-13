import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing runner
vi.mock('../lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

vi.mock('../services/topstepx/client', () => ({
  TopstepXClient: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    getHistoricalBars: vi.fn().mockResolvedValue({
      success: true,
      bars: [
        { timestamp: '2026-02-12T10:00:00Z', open: 18500, high: 18550, low: 18450, close: 18520, volume: 1000 },
        { timestamp: '2026-02-12T10:05:00Z', open: 18520, high: 18560, low: 18480, close: 18540, volume: 1200 },
      ],
      errorMessage: null,
    }),
    placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 12345, errorMessage: null }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true, orderId: 12345, errorMessage: null }),
  })),
}));

vi.mock('../services/topstepx/streaming', () => ({
  TopstepXStreaming: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribeMarketData: vi.fn().mockResolvedValue(undefined),
    subscribeUserEvents: vi.fn().mockResolvedValue(undefined),
    onTick: vi.fn(),
    onFill: vi.fn(),
    onOrderStatus: vi.fn(),
    onPositionUpdate: vi.fn(),
    onStateChange: vi.fn(),
  })),
}));

vi.mock('./llm-analyzer', () => ({
  analyzeTrade: vi.fn().mockResolvedValue(null),
}));

import { BotRunner } from './runner';

const config = {
  accountId: 1,
  contractId: 'CON.F.US.ENQ.M25',
  dryRun: true,
};

describe('BotRunner', () => {
  let runner: BotRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new BotRunner(config);
  });

  describe('lifecycle', () => {
    it('should start successfully', async () => {
      await runner.start();
      expect(runner.getStatus().running).toBe(true);
    });

    it('should stop successfully', async () => {
      await runner.start();
      await runner.stop();
      expect(runner.getStatus().running).toBe(false);
    });

    it('should not start twice', async () => {
      await runner.start();
      await runner.start(); // Second start should be no-op
      expect(runner.getStatus().running).toBe(true);
    });

    it('should not stop if not running', async () => {
      await runner.stop(); // Should not throw
      expect(runner.getStatus().running).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = runner.getStatus();
      expect(status.running).toBe(false);
      expect(status.activePositions).toBe(0);
      expect(status.totalPositions).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should forward position events to listeners', async () => {
      const events: unknown[] = [];
      runner.onEvent((e) => events.push(e));

      await runner.start();

      // Directly interact with position manager
      const pm = runner.getPositionManager();
      pm.openPosition('pos-1', 'alert-1', 'NQ', 'buy', 1, {
        poc: 18500, vah: 18550, val: 18450, rangeHigh: 18600, rangeLow: 18400, profileBins: [], totalVolume: 50000,
      }, 85);

      expect(events).toHaveLength(1);
      expect((events[0] as { type: string }).type).toBe('opened');
    });
  });
});
