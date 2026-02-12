// E2E test: Dashboard real-time refresh pipeline
// Verifies: webhook POST → alert stored → alerts API returns new alert
// This tests the API-level data flow that powers dashboard real-time updates

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Shared alert storage ---
const storedAlerts: Record<string, unknown>[] = [];

// Mock logger
vi.mock('../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock alert-storage to capture saved alerts
vi.mock('../../src/services/alert-storage', () => ({
  saveAlert: vi.fn((payload: Record<string, unknown>) => {
    const id = `rt-test-${Date.now()}-${storedAlerts.length}`;
    storedAlerts.push({
      id,
      created_at: new Date().toISOString(),
      symbol: payload.symbol,
      action: payload.action,
      quantity: payload.quantity,
      order_type: 'market',
      price: null,
      stop_loss: null,
      take_profit: null,
      comment: null,
      status: 'received',
      error_message: null,
      order_id: null,
      executed_at: null,
      raw_payload: payload,
    });
    return Promise.resolve(id);
  }),
}));

// Mock supabase for the alerts API to read from storedAlerts
function createAlertsQueryBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = () => builder;
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    return Promise.resolve({ data: [...storedAlerts], error: null }).then(resolve, reject);
  };
  return builder;
}

let alertsFromCallIndex = 0;
vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      alertsFromCallIndex++;
      if (alertsFromCallIndex % 2 === 1) {
        // Count query
        const countBuilder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
          countBuilder[method] = () => countBuilder;
        }
        countBuilder.then = (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          return Promise.resolve({ count: storedAlerts.length, error: null }).then(resolve, reject);
        };
        return countBuilder;
      }
      // Data query
      return createAlertsQueryBuilder();
    },
  }),
}));

import webhookHandler from '../../api/webhook';
import alertsHandler from '../../api/alerts';

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    query: {},
    body: {},
    ...overrides,
  } as VercelRequest;
}

function createMockResponse(): {
  res: VercelResponse;
  getStatus: () => number;
  getData: () => unknown;
} {
  let statusCode = 200;
  let responseData: unknown = null;

  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: unknown) => {
      responseData = data;
      return res;
    }),
  } as unknown as VercelResponse;

  return { res, getStatus: () => statusCode, getData: () => responseData };
}

describe('Dashboard Real-Time Pipeline E2E', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'rt-e2e-secret';
    storedAlerts.length = 0;
    alertsFromCallIndex = 0;
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it('webhook creates alert that appears in alerts API response', async () => {
    // Step 1: Verify alerts API returns empty initially
    const listReq1 = createMockRequest({ method: 'GET', body: undefined });
    const list1 = createMockResponse();
    await alertsHandler(listReq1, list1.res);

    expect(list1.getStatus()).toBe(200);
    const before = list1.getData() as { data: unknown[]; pagination: { total: number } };
    expect(before.pagination.total).toBe(0);

    // Step 2: Send webhook to create an alert
    const webhookReq = createMockRequest({
      body: {
        secret: 'rt-e2e-secret',
        ticker: 'ES',
        action: 'buy',
        quantity: 1,
        open: 5900.00,
        close: 5905.00,
        high: 5910.00,
        low: 5895.00,
        volume: 10000,
      },
    });
    const webhookRes = createMockResponse();
    await webhookHandler(webhookReq, webhookRes.res);

    expect(webhookRes.getStatus()).toBe(200);
    const webhookData = webhookRes.getData() as { success: boolean; data: { alertId: string } };
    expect(webhookData.success).toBe(true);
    expect(webhookData.data.alertId).toBeDefined();

    // Step 3: Verify alerts API now returns the new alert
    const listReq2 = createMockRequest({ method: 'GET', body: undefined });
    const list2 = createMockResponse();
    await alertsHandler(listReq2, list2.res);

    expect(list2.getStatus()).toBe(200);
    const after = list2.getData() as {
      data: Array<{ symbol: string; action: string; quantity: number }>;
      pagination: { total: number };
    };
    expect(after.pagination.total).toBe(1);
    expect(after.data).toHaveLength(1);
    expect(after.data[0].symbol).toBe('ES');
    expect(after.data[0].action).toBe('buy');
  });

  it('multiple webhooks create multiple alerts in sequence', async () => {
    // Send first webhook
    const req1 = createMockRequest({
      body: {
        secret: 'rt-e2e-secret',
        ticker: 'ES',
        action: 'buy',
        quantity: 1,
      },
    });
    const res1 = createMockResponse();
    await webhookHandler(req1, res1.res);
    expect(res1.getStatus()).toBe(200);

    // Send second webhook
    const req2 = createMockRequest({
      body: {
        secret: 'rt-e2e-secret',
        ticker: 'NQ',
        action: 'sell',
        quantity: 2,
      },
    });
    const res2 = createMockResponse();
    await webhookHandler(req2, res2.res);
    expect(res2.getStatus()).toBe(200);

    // Verify both appear
    const listReq = createMockRequest({ method: 'GET', body: undefined });
    const listRes = createMockResponse();
    await alertsHandler(listReq, listRes.res);

    expect(listRes.getStatus()).toBe(200);
    const data = listRes.getData() as {
      data: Array<{ symbol: string; action: string }>;
      pagination: { total: number };
    };
    expect(data.pagination.total).toBe(2);
    expect(data.data).toHaveLength(2);
  });
});
