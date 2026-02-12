/**
 * E2E Tests for Webhook Endpoint
 *
 * These tests hit the actual deployed API and verify:
 * - Endpoint accessibility
 * - Request validation
 * - Response format
 * - Database persistence (when applicable)
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Use production URL or local dev server
const BASE_URL = process.env.E2E_BASE_URL || 'https://topstep-bot-50.vercel.app';
const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET || 'test-secret-123';

describe('Webhook E2E Tests', () => {
  beforeAll(() => {
    console.log(`Running E2E tests against: ${BASE_URL}`);
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Webhook Endpoint', () => {
    it('should reject GET requests with 405', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`);
      expect(response.status).toBe(405);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Method not allowed');
    });

    it('should reject requests without secret', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'MNQ',
          action: 'buy',
          quantity: 1,
        }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
    });

    it('should reject requests with invalid secret', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'wrong-secret',
          symbol: 'MNQ',
          action: 'buy',
          quantity: 1,
        }),
      });
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject invalid action types', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: WEBHOOK_SECRET,
          symbol: 'MNQ',
          action: 'invalid_action',
          quantity: 1,
        }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.details).toBeDefined();
    });

    it('should accept valid buy request', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: WEBHOOK_SECRET,
          symbol: 'MNQ',
          action: 'buy',
          quantity: 1,
        }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Webhook received and validated');
      expect(data.data).toBeDefined();
      expect(data.data.symbol).toBe('MNQ');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);
      expect(data.data.alertId).toBeDefined();
    });

    it('should accept valid sell request', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: WEBHOOK_SECRET,
          symbol: 'ES',
          action: 'sell',
          quantity: 2,
        }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('sell');
    });

    it('should accept close positions', async () => {
      const closeActions = ['close', 'close_long', 'close_short'];

      for (const action of closeActions) {
        const response = await fetch(`${BASE_URL}/api/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: WEBHOOK_SECRET,
            symbol: 'NQ',
            action,
            quantity: 1,
          }),
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.action).toBe(action);
      }
    });

    it('should accept optional parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: WEBHOOK_SECRET,
          symbol: 'MNQ',
          action: 'buy',
          quantity: 1,
          orderType: 'limit',
          price: 15000.5,
          stopLoss: 14950.0,
          takeProfit: 15100.0,
          comment: 'E2E test order',
        }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
