import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateWebhookSecret, validateWebhookPayload } from './validation';

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
});
