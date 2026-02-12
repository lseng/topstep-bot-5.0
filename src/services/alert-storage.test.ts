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

      // Check values - secret should be hashed (64 char hex string)
      const secretHash = values[0] as string;
      expect(secretHash).toHaveLength(64);
      expect(secretHash).toMatch(/^[0-9a-f]{64}$/);

      // Symbol, action, quantity
      expect(values[1]).toBe('ES');
      expect(values[2]).toBe('buy');
      expect(values[3]).toBe(1);

      // Optional fields should be null
      expect(values[4]).toBeNull(); // interval
      expect(values[5]).toBeNull(); // alert_time
      expect(values[6]).toBeNull(); // open_price
      expect(values[7]).toBeNull(); // high_price
      expect(values[8]).toBeNull(); // low_price
      expect(values[9]).toBeNull(); // close_price
      expect(values[10]).toBeNull(); // bar_volume
      expect(values[11]).toBeNull(); // order_type
      expect(values[12]).toBeNull(); // price
      expect(values[13]).toBeNull(); // stop_loss
      expect(values[14]).toBeNull(); // take_profit
      expect(values[15]).toBeNull(); // comment
      expect(values[16]).toBe('received'); // status
    });

    it('saves an alert with all OHLCV fields populated', async () => {
      const alertId = '660e8400-e29b-41d4-a716-446655440000';
      mockQuery.mockResolvedValue([{ id: alertId }]);

      const result = await saveAlert(fullPayload);

      expect(result).toBe(alertId);

      const values = mockQuery.mock.calls[0].slice(1);

      // Symbol, action, quantity
      expect(values[1]).toBe('NQ');
      expect(values[2]).toBe('sell');
      expect(values[3]).toBe(3);

      // Interval and alert_time
      expect(values[4]).toBe('5');
      expect(values[5]).toEqual(new Date('2026-01-15T10:30:00Z'));

      // OHLCV fields
      expect(values[6]).toBe(4850.25); // open
      expect(values[7]).toBe(4853.0); // high
      expect(values[8]).toBe(4849.75); // low
      expect(values[9]).toBe(4852.5); // close
      expect(values[10]).toBe(12500); // volume

      // Optional order fields
      expect(values[11]).toBe('limit'); // order_type
      expect(values[12]).toBe(4852.0); // price
      expect(values[13]).toBe(4845.0); // stop_loss
      expect(values[14]).toBe(4870.0); // take_profit
      expect(values[15]).toBe('Test alert'); // comment
      expect(values[16]).toBe('received'); // status
    });

    it('hashes the secret consistently', async () => {
      mockQuery.mockResolvedValue([{ id: 'test-id' }]);

      await saveAlert(minimalPayload);
      const hash1 = mockQuery.mock.calls[0][1];

      mockQuery.mockClear();
      await saveAlert(minimalPayload);
      const hash2 = mockQuery.mock.calls[0][1];

      expect(hash1).toBe(hash2);
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
