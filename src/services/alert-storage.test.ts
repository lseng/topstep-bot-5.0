import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAlert } from './alert-storage';
import type { ParsedWebhookPayload } from '../types';

// Mock the supabase module
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      insert: (...args: unknown[]) => {
        mockInsert(...args);
        return {
          select: (...sArgs: unknown[]) => {
            mockSelect(...sArgs);
            return { single: () => mockSingle() };
          },
        };
      },
    }),
  }),
}));

// Mock the logger to keep test output clean
vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('alert-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveAlert', () => {
    const minimalPayload: ParsedWebhookPayload = {
      secret: 'test-secret',
      symbol: 'ES',
      action: 'buy',
      quantity: 1,
    };

    const fullPayload: ParsedWebhookPayload = {
      secret: 'test-secret',
      symbol: 'NQ',
      action: 'sell',
      quantity: 3,
      interval: '5',
      alertTime: new Date('2026-01-15T10:30:00Z'),
      ohlcv: {
        open: 4850.25,
        high: 4853.0,
        low: 4849.75,
        close: 4852.5,
        volume: 12500,
      },
      orderType: 'limit',
      price: 4852.0,
      stopLoss: 4845.0,
      takeProfit: 4870.0,
      comment: 'Test alert',
    };

    it('saves an alert with minimal required fields and returns the ID', async () => {
      const alertId = '550e8400-e29b-41d4-a716-446655440000';
      mockSingle.mockResolvedValue({ data: { id: alertId }, error: null });

      const result = await saveAlert(minimalPayload);

      expect(result).toBe(alertId);
      expect(mockInsert).toHaveBeenCalledOnce();

      const insertArg = mockInsert.mock.calls[0][0];
      expect(insertArg.symbol).toBe('ES');
      expect(insertArg.action).toBe('buy');
      expect(insertArg.quantity).toBe(1);
      expect(insertArg.order_type).toBe('market');
      expect(insertArg.price).toBeNull();
      expect(insertArg.stop_loss).toBeNull();
      expect(insertArg.take_profit).toBeNull();
      expect(insertArg.comment).toBeNull();
      expect(insertArg.status).toBe('received');
      expect(insertArg.raw_payload.symbol).toBe('ES');
      expect(insertArg.raw_payload.action).toBe('buy');
    });

    it('saves an alert with all OHLCV fields populated', async () => {
      const alertId = '660e8400-e29b-41d4-a716-446655440000';
      mockSingle.mockResolvedValue({ data: { id: alertId }, error: null });

      const result = await saveAlert(fullPayload);

      expect(result).toBe(alertId);

      const insertArg = mockInsert.mock.calls[0][0];
      expect(insertArg.symbol).toBe('NQ');
      expect(insertArg.action).toBe('sell');
      expect(insertArg.quantity).toBe(3);
      expect(insertArg.order_type).toBe('limit');
      expect(insertArg.price).toBe(4852.0);
      expect(insertArg.stop_loss).toBe(4845.0);
      expect(insertArg.take_profit).toBe(4870.0);
      expect(insertArg.comment).toBe('Test alert');

      // raw_payload should contain OHLCV data
      expect(insertArg.raw_payload.open).toBe(4850.25);
      expect(insertArg.raw_payload.high).toBe(4853.0);
      expect(insertArg.raw_payload.low).toBe(4849.75);
      expect(insertArg.raw_payload.close).toBe(4852.5);
      expect(insertArg.raw_payload.volume).toBe(12500);
      expect(insertArg.raw_payload.interval).toBe('5');
    });

    it('throws an error when the database insert fails', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Connection refused' } });

      await expect(saveAlert(minimalPayload)).rejects.toThrow(
        'Failed to save alert: Connection refused'
      );
    });

    it('wraps non-Error exceptions in a descriptive message', async () => {
      mockSingle.mockRejectedValue('string error');

      await expect(saveAlert(minimalPayload)).rejects.toThrow(
        'Failed to save alert: Unknown database error'
      );
    });
  });
});
