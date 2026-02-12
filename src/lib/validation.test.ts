import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateWebhookSecret, validateWebhookPayload, validateTradingViewPayload } from './validation';

describe('validation', () => {
  describe('validateWebhookSecret', () => {
    beforeEach(() => {
      process.env.WEBHOOK_SECRET = 'test-secret-123';
    });

    afterEach(() => {
      delete process.env.WEBHOOK_SECRET;
    });

    it('returns true for matching secret', () => {
      expect(validateWebhookSecret('test-secret-123')).toBe(true);
    });

    it('returns false for non-matching secret', () => {
      expect(validateWebhookSecret('wrong-secret')).toBe(false);
    });

    it('returns false for undefined secret', () => {
      expect(validateWebhookSecret(undefined)).toBe(false);
    });

    it('returns false when WEBHOOK_SECRET is not set', () => {
      delete process.env.WEBHOOK_SECRET;
      expect(validateWebhookSecret('any-secret')).toBe(false);
    });
  });

  describe('validateWebhookPayload', () => {
    const validPayload = {
      secret: 'test-secret',
      symbol: 'ES',
      action: 'buy',
      quantity: 1,
    };

    it('returns valid for a complete valid payload', () => {
      const result = validateWebhookPayload(validPayload);
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(validPayload);
      expect(result.errors).toBeUndefined();
    });

    it('returns valid with optional fields', () => {
      const payload = {
        ...validPayload,
        orderType: 'limit',
        price: 5000.50,
        stopLoss: 4990.00,
        takeProfit: 5020.00,
        comment: 'Test trade',
      };
      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(payload);
    });

    it('returns error for null body', () => {
      const result = validateWebhookPayload(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].field).toBe('body');
    });

    it('returns error for non-object body', () => {
      const result = validateWebhookPayload('string');
      expect(result.valid).toBe(false);
      expect(result.errors![0].field).toBe('body');
    });

    it('returns error for array body', () => {
      const result = validateWebhookPayload([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.errors![0].field).toBe('body');
    });

    it('returns error for missing secret', () => {
      const { secret: _, ...payload } = validPayload;
      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'secret')).toBe(true);
    });

    it('returns error for missing symbol', () => {
      const { symbol: _, ...payload } = validPayload;
      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'symbol')).toBe(true);
    });

    it('returns error for missing action', () => {
      const { action: _, ...payload } = validPayload;
      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'action')).toBe(true);
    });

    it('returns error for missing quantity', () => {
      const { quantity: _, ...payload } = validPayload;
      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
    });

    it('returns error for invalid action type', () => {
      const result = validateWebhookPayload({ ...validPayload, action: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'action')).toBe(true);
      expect(result.errors![0].message).toContain('must be one of');
    });

    it('accepts all valid action types', () => {
      const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];
      for (const action of validActions) {
        const result = validateWebhookPayload({ ...validPayload, action });
        expect(result.valid).toBe(true);
      }
    });

    it('returns error for non-number quantity', () => {
      const result = validateWebhookPayload({ ...validPayload, quantity: 'one' });
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
    });

    it('returns error for zero quantity', () => {
      const result = validateWebhookPayload({ ...validPayload, quantity: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
      expect(result.errors![0].message).toContain('positive');
    });

    it('returns error for negative quantity', () => {
      const result = validateWebhookPayload({ ...validPayload, quantity: -5 });
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
      expect(result.errors![0].message).toContain('positive');
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const result = validateWebhookPayload({});
      expect(result.valid).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(1);
    });

    it('allows null price', () => {
      const result = validateWebhookPayload({ ...validPayload, price: null });
      expect(result.valid).toBe(true);
      expect(result.payload!.price).toBe(null);
    });
  });

  describe('validateTradingViewPayload', () => {
    const validPayload = {
      secret: 'test-secret',
      ticker: 'ES',
      action: 'buy',
    };

    describe('basic validation', () => {
      it('returns valid for a minimal TradingView payload', () => {
        const result = validateTradingViewPayload(validPayload);
        expect(result.valid).toBe(true);
        expect(result.payload).toMatchObject({
          secret: 'test-secret',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
        });
        expect(result.errors).toBeUndefined();
      });

      it('returns error for null body', () => {
        const result = validateTradingViewPayload(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0].field).toBe('body');
      });

      it('returns error for non-object body', () => {
        const result = validateTradingViewPayload('string');
        expect(result.valid).toBe(false);
        expect(result.errors![0].field).toBe('body');
      });

      it('returns error for array body', () => {
        const result = validateTradingViewPayload([1, 2, 3]);
        expect(result.valid).toBe(false);
        expect(result.errors![0].field).toBe('body');
      });

      it('returns error for missing secret', () => {
        const { secret: _, ...payload } = validPayload;
        const result = validateTradingViewPayload(payload);
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'secret')).toBe(true);
      });

      it('returns error for missing action', () => {
        const { action: _, ...payload } = validPayload;
        const result = validateTradingViewPayload(payload);
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'action')).toBe(true);
      });
    });

    describe('ticker to symbol mapping', () => {
      it('accepts ticker field and maps to symbol', () => {
        const result = validateTradingViewPayload({
          secret: 'test-secret',
          ticker: 'nq',
          action: 'buy',
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.symbol).toBe('NQ');
      });

      it('accepts symbol field directly', () => {
        const result = validateTradingViewPayload({
          secret: 'test-secret',
          symbol: 'es',
          action: 'sell',
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.symbol).toBe('ES');
      });

      it('prefers ticker over symbol when both provided', () => {
        const result = validateTradingViewPayload({
          secret: 'test-secret',
          ticker: 'NQ',
          symbol: 'ES',
          action: 'buy',
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.symbol).toBe('NQ');
      });

      it('returns error when neither ticker nor symbol is provided', () => {
        const result = validateTradingViewPayload({
          secret: 'test-secret',
          action: 'buy',
        });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'symbol')).toBe(true);
      });

      it('uppercases the symbol', () => {
        const result = validateTradingViewPayload({
          secret: 'test-secret',
          ticker: 'es',
          action: 'buy',
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.symbol).toBe('ES');
      });
    });

    describe('quantity defaulting to 1', () => {
      it('defaults quantity to 1 when not provided', () => {
        const result = validateTradingViewPayload(validPayload);
        expect(result.valid).toBe(true);
        expect(result.payload!.quantity).toBe(1);
      });

      it('accepts explicit quantity', () => {
        const result = validateTradingViewPayload({ ...validPayload, quantity: 5 });
        expect(result.valid).toBe(true);
        expect(result.payload!.quantity).toBe(5);
      });

      it('returns error for non-number quantity', () => {
        const result = validateTradingViewPayload({ ...validPayload, quantity: 'five' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
      });

      it('returns error for zero quantity', () => {
        const result = validateTradingViewPayload({ ...validPayload, quantity: 0 });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
      });

      it('returns error for negative quantity', () => {
        const result = validateTradingViewPayload({ ...validPayload, quantity: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'quantity')).toBe(true);
      });

      it('defaults quantity when null', () => {
        const result = validateTradingViewPayload({ ...validPayload, quantity: null });
        expect(result.valid).toBe(true);
        expect(result.payload!.quantity).toBe(1);
      });
    });

    describe('action validation', () => {
      it('accepts all valid action types', () => {
        const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];
        for (const action of validActions) {
          const result = validateTradingViewPayload({ ...validPayload, action });
          expect(result.valid).toBe(true);
        }
      });

      it('normalizes action to lowercase', () => {
        const result = validateTradingViewPayload({ ...validPayload, action: 'BUY' });
        expect(result.valid).toBe(true);
        expect(result.payload!.action).toBe('buy');
      });

      it('returns error for invalid action type', () => {
        const result = validateTradingViewPayload({ ...validPayload, action: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'action')).toBe(true);
        expect(result.errors![0].message).toContain('must be one of');
      });
    });

    describe('OHLCV field validation', () => {
      it('accepts valid OHLCV data', () => {
        const result = validateTradingViewPayload({
          ...validPayload,
          open: 5000.25,
          high: 5010.50,
          low: 4995.75,
          close: 5005.00,
          volume: 15000,
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.ohlcv).toEqual({
          open: 5000.25,
          high: 5010.50,
          low: 4995.75,
          close: 5005.00,
          volume: 15000,
        });
      });

      it('accepts partial OHLCV data', () => {
        const result = validateTradingViewPayload({
          ...validPayload,
          close: 5005.00,
        });
        expect(result.valid).toBe(true);
        expect(result.payload!.ohlcv).toEqual({ close: 5005.00 });
      });

      it('returns undefined ohlcv when no OHLCV fields provided', () => {
        const result = validateTradingViewPayload(validPayload);
        expect(result.valid).toBe(true);
        expect(result.payload!.ohlcv).toBeUndefined();
      });

      it('returns error for non-numeric open', () => {
        const result = validateTradingViewPayload({ ...validPayload, open: 'not-a-number' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'open')).toBe(true);
      });

      it('returns error for non-numeric high', () => {
        const result = validateTradingViewPayload({ ...validPayload, high: 'not-a-number' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'high')).toBe(true);
      });

      it('returns error for non-numeric low', () => {
        const result = validateTradingViewPayload({ ...validPayload, low: 'not-a-number' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'low')).toBe(true);
      });

      it('returns error for non-numeric close', () => {
        const result = validateTradingViewPayload({ ...validPayload, close: 'not-a-number' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'close')).toBe(true);
      });

      it('returns error for non-numeric volume', () => {
        const result = validateTradingViewPayload({ ...validPayload, volume: 'not-a-number' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'volume')).toBe(true);
      });

      it('returns error for negative volume', () => {
        const result = validateTradingViewPayload({ ...validPayload, volume: -100 });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'volume')).toBe(true);
        expect(result.errors![0].message).toContain('non-negative');
      });

      it('accepts zero volume', () => {
        const result = validateTradingViewPayload({ ...validPayload, volume: 0 });
        expect(result.valid).toBe(true);
        expect(result.payload!.ohlcv!.volume).toBe(0);
      });
    });

    describe('interval and time validation', () => {
      it('accepts valid interval string', () => {
        const result = validateTradingViewPayload({ ...validPayload, interval: '15' });
        expect(result.valid).toBe(true);
        expect(result.payload!.interval).toBe('15');
      });

      it('returns error for non-string interval', () => {
        const result = validateTradingViewPayload({ ...validPayload, interval: 15 });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'interval')).toBe(true);
      });

      it('accepts valid ISO time string', () => {
        const timeStr = '2024-01-15T10:30:00Z';
        const result = validateTradingViewPayload({ ...validPayload, time: timeStr });
        expect(result.valid).toBe(true);
        expect(result.payload!.alertTime).toEqual(new Date(timeStr));
      });

      it('returns error for invalid time format', () => {
        const result = validateTradingViewPayload({ ...validPayload, time: 'not-a-date' });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'time')).toBe(true);
        expect(result.errors![0].message).toContain('valid ISO timestamp');
      });

      it('returns error for non-string time', () => {
        const result = validateTradingViewPayload({ ...validPayload, time: 123456789 });
        expect(result.valid).toBe(false);
        expect(result.errors!.some((e) => e.field === 'time')).toBe(true);
      });
    });

    describe('optional fields', () => {
      it('accepts all optional order fields', () => {
        const result = validateTradingViewPayload({
          ...validPayload,
          quantity: 2,
          orderType: 'limit',
          price: 5000.50,
          stopLoss: 4990.00,
          takeProfit: 5020.00,
          comment: 'Test trade',
        });
        expect(result.valid).toBe(true);
        expect(result.payload).toMatchObject({
          quantity: 2,
          orderType: 'limit',
          price: 5000.50,
          stopLoss: 4990.00,
          takeProfit: 5020.00,
          comment: 'Test trade',
        });
      });

      it('allows null price', () => {
        const result = validateTradingViewPayload({ ...validPayload, price: null });
        expect(result.valid).toBe(true);
        expect(result.payload!.price).toBe(null);
      });
    });

    describe('multiple errors', () => {
      it('returns multiple errors for multiple invalid fields', () => {
        const result = validateTradingViewPayload({
          action: 'invalid',
          quantity: -1,
          open: 'not-a-number',
        });
        expect(result.valid).toBe(false);
        expect(result.errors!.length).toBeGreaterThan(1);
      });
    });
  });
});
