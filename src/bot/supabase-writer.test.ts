import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseWriteQueue } from './supabase-writer';
import type { ManagedPosition, TradeResult, PositionSide } from './types';
import type { VpvrResult } from '../services/vpvr/types';

// Mock Supabase client
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'positions') {
    return { update: mockUpdate, insert: mockInsert };
  }
  return { insert: mockInsert };
});

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

function makeVpvr(): VpvrResult {
  return { bins: [], poc: 5050, vah: 5080, val: 5020, totalVolume: 100000, rangeHigh: 5100, rangeLow: 5000, barCount: 60 };
}

function makePosition(overrides?: Partial<ManagedPosition>): ManagedPosition {
  return {
    id: 'pos-1',
    alertId: 'alert-1',
    symbol: 'ES',
    side: 'long' as PositionSide,
    state: 'active',
    entryOrderId: 123,
    entryPrice: 5020,
    targetEntryPrice: 5020,
    quantity: 1,
    contractId: 'CON.F.US.EPH26',
    accountId: 1001,
    currentSl: 5018,
    initialSl: 5018,
    tp1Price: 5050,
    tp2Price: 5080,
    tp3Price: 5100,
    unrealizedPnl: 500,
    lastPrice: 5030,
    vpvrData: makeVpvr(),
    createdAt: new Date('2026-02-12T15:00:00Z'),
    updatedAt: new Date('2026-02-12T15:05:00Z'),
    dirty: true,
    ...overrides,
  };
}

function makeTradeResult(): TradeResult {
  return {
    positionId: 'pos-1',
    alertId: 'alert-1',
    symbol: 'ES',
    side: 'long',
    entryPrice: 5020,
    entryTime: new Date('2026-02-12T15:00:00Z'),
    exitPrice: 5050,
    exitTime: new Date('2026-02-12T15:30:00Z'),
    exitReason: 'sl_hit_from_tp1_hit',
    quantity: 1,
    grossPnl: 1500,
    fees: 0,
    netPnl: 1500,
    vpvrPoc: 5050,
    vpvrVah: 5080,
    vpvrVal: 5020,
    highestTpHit: 'tp1',
    confirmationScore: 85,
  };
}

describe('SupabaseWriteQueue', () => {
  let queue: SupabaseWriteQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    queue = new SupabaseWriteQueue(5000);
  });

  afterEach(() => {
    queue.stop();
    vi.useRealTimers();
  });

  describe('dirty flag pattern', () => {
    it('markDirty adds position to pending writes', () => {
      queue.markDirty(makePosition());
      expect(queue.pendingCount).toBe(1);
    });

    it('flush clears pending writes', async () => {
      queue.markDirty(makePosition());
      await queue.flush();
      expect(queue.pendingCount).toBe(0);
    });

    it('only writes changed positions', async () => {
      const pos1 = makePosition({ id: 'pos-1' });
      const pos2 = makePosition({ id: 'pos-2' });
      queue.markDirty(pos1);
      queue.markDirty(pos2);

      const written = await queue.flush();
      expect(written).toBe(2);
      expect(mockFrom).toHaveBeenCalledWith('positions');
    });
  });

  describe('5-second flush interval', () => {
    it('start creates interval timer', () => {
      queue.start();
      queue.markDirty(makePosition());

      vi.advanceTimersByTime(5000);

      // flush should have been called via interval
      expect(mockFrom).toHaveBeenCalled();
    });

    it('stop clears interval timer', () => {
      queue.start();
      queue.stop();

      queue.markDirty(makePosition());
      vi.advanceTimersByTime(10000);

      // No calls after stop
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('writeTradeLog', () => {
    it('inserts trade log immediately', async () => {
      const trade = makeTradeResult();
      await queue.writeTradeLog(trade);

      expect(mockFrom).toHaveBeenCalledWith('trades_log');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          position_id: 'pos-1',
          symbol: 'ES',
          side: 'long',
          entry_price: 5020,
          exit_price: 5050,
          net_pnl: 1500,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('re-adds position to dirty queue on write failure', async () => {
      mockUpdate.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ error: { message: 'Write failed' } }),
      });

      queue.markDirty(makePosition());
      const written = await queue.flush();

      expect(written).toBe(0);
      expect(queue.pendingCount).toBe(1); // Re-queued
    });
  });

  describe('start/stop lifecycle', () => {
    it('multiple start calls do not create duplicate timers', () => {
      queue.start();
      queue.start();
      queue.stop();

      queue.markDirty(makePosition());
      vi.advanceTimersByTime(10000);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
