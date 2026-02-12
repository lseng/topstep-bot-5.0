import { describe, it, expect } from 'vitest';
import {
  detectPayloadFormat,
  parseJsonPayload,
  parseCsvPayload,
  parseWebhookPayload,
  parseTradingViewAlert,
} from './tradingview-parser';

describe('tradingview-parser', () => {
  describe('detectPayloadFormat', () => {
    it('detects JSON format when content starts with {', () => {
      expect(detectPayloadFormat('{"secret": "test"}')).toBe('json');
    });

    it('detects JSON format with leading whitespace', () => {
      expect(detectPayloadFormat('  {"secret": "test"}')).toBe('json');
    });

    it('detects CSV format for comma-separated values', () => {
      expect(detectPayloadFormat('secret, buy, ES')).toBe('csv');
    });

    it('detects CSV format for plain text', () => {
      expect(detectPayloadFormat('test-secret')).toBe('csv');
    });
  });

  describe('parseJsonPayload', () => {
    const validJsonPayload = {
      secret: 'test-secret',
      ticker: 'ES',
      action: 'buy',
      quantity: 2,
      interval: '5',
      time: '2024-01-15T10:30:00Z',
      open: 4850.25,
      high: 4853.0,
      low: 4849.75,
      close: 4852.5,
      volume: 12500,
    };

    it('parses valid JSON payload with all TradingView fields', () => {
      const result = parseJsonPayload(JSON.stringify(validJsonPayload));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('ES');
        expect(result.payload.action).toBe('buy');
        expect(result.payload.quantity).toBe(2);
        expect(result.payload.interval).toBe('5');
        expect(result.payload.alertTime).toEqual(new Date('2024-01-15T10:30:00Z'));
        expect(result.payload.ohlcv).toEqual({
          open: 4850.25,
          high: 4853.0,
          low: 4849.75,
          close: 4852.5,
          volume: 12500,
        });
      }
    });

    it('maps ticker to symbol in uppercase', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'es', action: 'buy' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('ES');
      }
    });

    it('uses symbol field if ticker is not provided', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', symbol: 'NQ', action: 'sell' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('NQ');
      }
    });

    it('prefers ticker over symbol when both are provided', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', symbol: 'NQ', action: 'buy' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('ES');
      }
    });

    it('defaults quantity to 1 when not provided', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.quantity).toBe(1);
      }
    });

    it('returns error for invalid JSON', () => {
      const result = parseJsonPayload('not valid json');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid JSON format');
      }
    });

    it('returns error for missing secret', () => {
      const result = parseJsonPayload(JSON.stringify({ ticker: 'ES', action: 'buy' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Secret');
      }
    });

    it('returns error for missing ticker and symbol', () => {
      const result = parseJsonPayload(JSON.stringify({ secret: 'test', action: 'buy' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('ticker or symbol');
      }
    });

    it('returns error for missing action', () => {
      const result = parseJsonPayload(JSON.stringify({ secret: 'test', ticker: 'ES' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Action');
      }
    });

    it('returns error for invalid action', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'invalid' })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('must be one of');
      }
    });

    it('accepts all valid action types', () => {
      const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];
      for (const action of validActions) {
        const result = parseJsonPayload(
          JSON.stringify({ secret: 'test', ticker: 'ES', action })
        );
        expect(result.success).toBe(true);
      }
    });

    it('normalizes action to lowercase', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'BUY' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.action).toBe('buy');
      }
    });

    it('returns error for invalid quantity (negative)', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy', quantity: -1 })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('positive');
      }
    });

    it('returns error for invalid quantity (zero)', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy', quantity: 0 })
      );
      expect(result.success).toBe(false);
    });

    it('returns error for invalid quantity (string)', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy', quantity: 'one' })
      );
      expect(result.success).toBe(false);
    });

    it('handles invalid time gracefully (no alertTime set)', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy', time: 'invalid' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.alertTime).toBeUndefined();
      }
    });

    it('does not include ohlcv if no OHLCV fields present', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy' })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.ohlcv).toBeUndefined();
      }
    });

    it('includes partial ohlcv data', () => {
      const result = parseJsonPayload(
        JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy', close: 5000.5 })
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.ohlcv).toEqual({ close: 5000.5 });
      }
    });

    it('preserves optional order fields', () => {
      const payload = {
        secret: 'test',
        ticker: 'ES',
        action: 'buy',
        orderType: 'limit',
        price: 5000.5,
        stopLoss: 4990.0,
        takeProfit: 5020.0,
        comment: 'Test trade',
      };
      const result = parseJsonPayload(JSON.stringify(payload));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.orderType).toBe('limit');
        expect(result.payload.price).toBe(5000.5);
        expect(result.payload.stopLoss).toBe(4990.0);
        expect(result.payload.takeProfit).toBe(5020.0);
        expect(result.payload.comment).toBe('Test trade');
      }
    });
  });

  describe('parseTradingViewAlert', () => {
    it('parses TradingViewAlert object directly', () => {
      const result = parseTradingViewAlert({
        secret: 'test',
        ticker: 'ES',
        action: 'buy',
        quantity: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('ES');
        expect(result.payload.quantity).toBe(5);
      }
    });
  });

  describe('parseCsvPayload', () => {
    it('parses full CSV payload', () => {
      const csv = 'test-secret, buy, ES, 5, 2024-01-15T10:30:00Z, 4850.25, 4852.50, 4853.00, 4849.75, 12500, 2';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.secret).toBe('test-secret');
        expect(result.payload.action).toBe('buy');
        expect(result.payload.symbol).toBe('ES');
        expect(result.payload.interval).toBe('5');
        expect(result.payload.alertTime).toEqual(new Date('2024-01-15T10:30:00Z'));
        expect(result.payload.ohlcv).toEqual({
          open: 4850.25,
          close: 4852.5,
          high: 4853.0,
          low: 4849.75,
          volume: 12500,
        });
        expect(result.payload.quantity).toBe(2);
      }
    });

    it('parses minimal CSV payload (secret, action, ticker)', () => {
      const csv = 'test-secret, buy, ES';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.secret).toBe('test-secret');
        expect(result.payload.action).toBe('buy');
        expect(result.payload.symbol).toBe('ES');
        expect(result.payload.quantity).toBe(1);
      }
    });

    it('defaults quantity to 1 when not provided', () => {
      const csv = 'test-secret, sell, NQ, 15, 2024-01-15T10:30:00Z';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.quantity).toBe(1);
      }
    });

    it('converts ticker to uppercase', () => {
      const csv = 'secret, buy, mes';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('MES');
      }
    });

    it('returns error for insufficient fields', () => {
      const csv = 'secret, buy';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('at least');
      }
    });

    it('returns error for empty secret', () => {
      const csv = ', buy, ES';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(false);
    });

    it('returns error for invalid action', () => {
      const csv = 'secret, invalid, ES';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(false);
    });

    it('returns error for empty ticker', () => {
      const csv = 'secret, buy, ';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(false);
    });

    it('handles missing optional fields gracefully', () => {
      const csv = 'secret, buy, ES, , , , , , , ';
      const result = parseCsvPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.interval).toBeUndefined();
        expect(result.payload.alertTime).toBeUndefined();
        expect(result.payload.ohlcv).toBeUndefined();
      }
    });

    it('accepts all valid action types', () => {
      const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];
      for (const action of validActions) {
        const result = parseCsvPayload(`secret, ${action}, ES`);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('parseWebhookPayload', () => {
    it('auto-detects and parses JSON payload', () => {
      const json = JSON.stringify({ secret: 'test', ticker: 'ES', action: 'buy' });
      const result = parseWebhookPayload(json);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('ES');
      }
    });

    it('auto-detects and parses CSV payload', () => {
      const csv = 'test-secret, sell, NQ';
      const result = parseWebhookPayload(csv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.symbol).toBe('NQ');
        expect(result.payload.action).toBe('sell');
      }
    });

    it('returns error for empty content', () => {
      const result = parseWebhookPayload('');
      expect(result.success).toBe(false);
    });

    it('returns error for whitespace-only content', () => {
      const result = parseWebhookPayload('   ');
      expect(result.success).toBe(false);
    });

    it('returns error for null content', () => {
      const result = parseWebhookPayload(null as unknown as string);
      expect(result.success).toBe(false);
    });

    it('handles JSON with leading whitespace', () => {
      const json = '  {"secret": "test", "ticker": "ES", "action": "buy"}';
      const result = parseWebhookPayload(json);
      expect(result.success).toBe(true);
    });
  });
});
