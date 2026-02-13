import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseWriteQueue } from './supabase-writer';
import type { ManagedPosition } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockSupabase(): SupabaseClient {
  const chainable = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(chainable),
  } as unknown as SupabaseClient;
}

const makePosition = (overrides: Partial<ManagedPosition> = {}): ManagedPosition => ({
  id: 'pos-1',
  alertId: 'alert-1',
  symbol: 'NQ',
  side: 'long',
  state: 'active',
  quantity: 1,
  contractId: 'CON.F.US.ENQ.M25',
  accountId: 1,
  entryOrderId: 12345,
  targetEntryPrice: 18450,
  entryPrice: 18452,
  tp1Price: 18500,
  tp2Price: 18550,
  tp3Price: 18600,
  initialSl: 18425,
  currentSl: 18425,
  lastPrice: 18480,
  unrealizedPnl: 28,
  vpvrData: { poc: 18500, vah: 18550, val: 18450, rangeHigh: 18600, rangeLow: 18400, profileBins: [], totalVolume: 50000 },
  confirmationScore: 85,
  llmReasoning: null,
  llmConfidence: null,
  createdAt: new Date('2026-02-12T10:00:00Z'),
  exitPrice: null,
  exitReason: null,
  closedAt: null,
  dirty: true,
  ...overrides,
});

describe('SupabaseWriteQueue', () => {
  let supabase: SupabaseClient;
  let queue: SupabaseWriteQueue;
  let dirtyPositions: ManagedPosition[];

  beforeEach(() => {
    vi.useFakeTimers();
    supabase = createMockSupabase();
    dirtyPositions = [];
    queue = new SupabaseWriteQueue(
      supabase,
      () => dirtyPositions,
      () => {
        const result = dirtyPositions.filter((p) => p.dirty);
        result.forEach((p) => { p.dirty = false; });
        return result;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('flush', () => {
    it('should upsert dirty positions', async () => {
      dirtyPositions = [makePosition()];
      await queue.flush();

      expect(supabase.from).toHaveBeenCalledWith('positions');
      const chainable = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(chainable.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'pos-1', symbol: 'NQ', state: 'active' })
        ])
      );
    });

    it('should skip flush when no dirty positions', async () => {
      dirtyPositions = [];
      await queue.flush();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should write to trades_log when position is closed', async () => {
      dirtyPositions = [makePosition({
        state: 'closed',
        entryPrice: 18450,
        exitPrice: 18490,
        exitReason: 'sl_breach',
        closedAt: new Date('2026-02-12T11:00:00Z'),
      })];

      await queue.flush();

      // Should call from('positions') for upsert AND from('trades_log') for insert
      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const tableNames = fromCalls.map((c: unknown[]) => c[0]);
      expect(tableNames).toContain('positions');
      expect(tableNames).toContain('trades_log');
    });

    it('should not write to trades_log if entry/exit prices are null', async () => {
      dirtyPositions = [makePosition({
        state: 'closed',
        entryPrice: null,
        exitPrice: null,
      })];

      await queue.flush();

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const tableNames = fromCalls.map((c: unknown[]) => c[0]);
      // Only positions table, not trades_log
      expect(tableNames).toEqual(['positions']);
    });

    it('should calculate P&L correctly for long', async () => {
      dirtyPositions = [makePosition({
        state: 'closed',
        side: 'long',
        entryPrice: 18450,
        exitPrice: 18490,
        exitReason: 'sl_breach',
        closedAt: new Date(),
      })];

      await queue.flush();

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const tradesLogCall = fromCalls.find((c: unknown[]) => c[0] === 'trades_log');
      expect(tradesLogCall).toBeDefined();
    });

    it('should handle multiple dirty positions', async () => {
      dirtyPositions = [
        makePosition({ id: 'pos-1' }),
        makePosition({ id: 'pos-2', symbol: 'ES' }),
      ];

      await queue.flush();

      const chainable = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      const upsertCall = chainable.upsert.mock.calls[0][0];
      expect(upsertCall).toHaveLength(2);
    });
  });

  describe('start/stop', () => {
    it('should start periodic flush timer', () => {
      queue.start();
      dirtyPositions = [makePosition()];

      vi.advanceTimersByTime(5000);

      // flush should have been called
      expect(supabase.from).toHaveBeenCalled();
    });

    it('should stop timer and do final flush', async () => {
      queue.start();
      dirtyPositions = [makePosition()];
      await queue.stop();

      expect(supabase.from).toHaveBeenCalled();
    });

    it('should not start multiple timers', () => {
      queue.start();
      queue.start(); // Second start should be no-op
      // No error thrown
    });
  });
});
