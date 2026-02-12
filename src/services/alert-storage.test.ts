import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAlert } from './alert-storage';
import type { ParsedWebhookPayload } from '../types';

// Mock the db module
const mockQuery = vi.fn();
vi.mock('../lib/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
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
      mockQuery.mockResolvedValue([{ id: alertId }]);

      const result = await saveAlert(minimalPayload);

      expect(result).toBe(alertId);
      expect(mockQuery).toHaveBeenCalledOnce();

      // Verify the tagged template literal args
      const callArgs = mockQuery.mock.calls[0];
      const templateStrings = callArgs[0];
      const values = callArgs.slice(1);

      // Template should contain SQL INSERT
      expect(templateStrings.join('')).toContain('INSERT INTO alerts');
      expect(templateStrings.join('')).toContain('RETURNING id');

      // symbol, action, quantity
      expect(values[0]).toBe('ES');
      expect(values[1]).toBe('buy');
      expect(values[2]).toBe(1);

      // order_type defaults to 'market'
      expect(values[3]).toBe('market');

      // Optional fields should be null
      expect(values[4]).toBeNull(); // price
      expect(values[5]).toBeNull(); // stop_loss
      expect(values[6]).toBeNull(); // take_profit
      expect(values[7]).toBeNull(); // comment
      expect(values[8]).toBe('received'); // status

      // raw_payload should be JSON string with minimal fields
      const rawPayload = JSON.parse(values[9] as string);
      expect(rawPayload.symbol).toBe('ES');
      expect(rawPayload.action).toBe('buy');
      expect(rawPayload.quantity).toBe(1);
    });

    it('saves an alert with all OHLCV fields populated', async () => {
      const alertId = '660e8400-e29b-41d4-a716-446655440000';
      mockQuery.mockResolvedValue([{ id: alertId }]);

      const result = await saveAlert(fullPayload);

      expect(result).toBe(alertId);

      const values = mockQuery.mock.calls[0].slice(1);

      // symbol, action, quantity
      expect(values[0]).toBe('NQ');
      expect(values[1]).toBe('sell');
      expect(values[2]).toBe(3);

      // order fields
      expect(values[3]).toBe('limit'); // order_type
      expect(values[4]).toBe(4852.0); // price
      expect(values[5]).toBe(4845.0); // stop_loss
      expect(values[6]).toBe(4870.0); // take_profit
      expect(values[7]).toBe('Test alert'); // comment
      expect(values[8]).toBe('received'); // status

      // raw_payload should contain OHLCV and all fields
      const rawPayload = JSON.parse(values[9] as string);
      expect(rawPayload.open).toBe(4850.25);
      expect(rawPayload.high).toBe(4853.0);
      expect(rawPayload.low).toBe(4849.75);
      expect(rawPayload.close).toBe(4852.5);
      expect(rawPayload.volume).toBe(12500);
      expect(rawPayload.interval).toBe('5');
      expect(rawPayload.alertTime).toBe('2026-01-15T10:30:00.000Z');
    });

    it('throws an error when the database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      await expect(saveAlert(minimalPayload)).rejects.toThrow(
        'Failed to save alert: Connection refused'
      );
    });

    it('wraps non-Error exceptions in a descriptive message', async () => {
      mockQuery.mockRejectedValue('string error');

      await expect(saveAlert(minimalPayload)).rejects.toThrow(
        'Failed to save alert: Unknown database error'
      );
    });
  });
});
