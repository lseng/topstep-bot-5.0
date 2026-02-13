import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopstepXClient } from './client';
import type { AuthResponse, OrderResponse, AccountSearchResponse, PositionSearchResponse, HistoricalBarsResponse } from './types';

const mockConfig = {
  baseUrl: 'https://api.example.com',
  username: 'testuser',
  apiKey: 'testapikey',
};

function mockFetch(responses: Array<{ ok: boolean; status?: number; json: unknown }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      statusText: resp.ok ? 'OK' : 'Internal Server Error',
      json: async () => resp.json,
    };
  }) as unknown as typeof fetch;
}

describe('TopstepXClient', () => {
  let client: TopstepXClient;

  beforeEach(() => {
    client = new TopstepXClient(mockConfig);
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate and return token', async () => {
      const authResp: AuthResponse = { success: true, token: 'abc123', errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([{ ok: true, json: authResp }]));

      const token = await client.getToken();
      expect(token).toBe('abc123');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/Auth/loginKey',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should cache the token across calls', async () => {
      const authResp: AuthResponse = { success: true, token: 'abc123', errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([{ ok: true, json: authResp }]));

      await client.getToken();
      await client.getToken();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should re-authenticate after clearing cache', async () => {
      const authResp: AuthResponse = { success: true, token: 'abc123', errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: { ...authResp, token: 'new-token' } },
      ]));

      await client.getToken();
      client.clearTokenCache();
      const token = await client.getToken();
      expect(token).toBe('new-token');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on auth failure (HTTP error)', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ok: false, status: 401, json: {} }]));
      await expect(client.getToken()).rejects.toThrow('Auth request failed');
    });

    it('should throw on auth failure (API error)', async () => {
      const authResp: AuthResponse = { success: false, token: null, errorMessage: 'Invalid key' };
      vi.stubGlobal('fetch', mockFetch([{ ok: true, json: authResp }]));
      await expect(client.getToken()).rejects.toThrow('Auth failed: Invalid key');
    });
  });

  describe('placeOrder', () => {
    it('should place an order successfully', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const orderResp: OrderResponse = { success: true, orderId: 12345, errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: orderResp },
      ]));

      const result = await client.placeOrder({
        accountId: 1,
        contractId: 'CON.F.US.ENQ.M25',
        type: 'Limit',
        side: 'Buy',
        size: 1,
        limitPrice: 5000.00,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(12345);
    });

    it('should throw on HTTP error', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: false, status: 500, json: {} },
      ]));

      await expect(client.placeOrder({
        accountId: 1,
        contractId: 'CON.F.US.ENQ.M25',
        type: 'Market',
        side: 'Sell',
        size: 1,
      })).rejects.toThrow('API request failed');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const cancelResp: OrderResponse = { success: true, orderId: 12345, errorMessage: null };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: cancelResp },
      ]));

      const result = await client.cancelOrder({ orderId: 12345, accountId: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe('searchAccounts', () => {
    it('should return accounts', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const accountsResp: AccountSearchResponse = {
        success: true,
        accounts: [{ id: 1, name: 'Test', balance: 50000, canTrade: true }],
        errorMessage: null,
      };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: accountsResp },
      ]));

      const result = await client.searchAccounts();
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts![0].name).toBe('Test');
    });
  });

  describe('searchPositions', () => {
    it('should return positions', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const posResp: PositionSearchResponse = {
        success: true,
        positions: [{
          accountId: 1,
          contractId: 'CON.F.US.ENQ.M25',
          contractName: 'NQ',
          averagePrice: 18500,
          size: 1,
          unrealizedPnL: 250,
        }],
        errorMessage: null,
      };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: posResp },
      ]));

      const result = await client.searchPositions(1);
      expect(result.positions).toHaveLength(1);
      expect(result.positions![0].contractId).toBe('CON.F.US.ENQ.M25');
    });
  });

  describe('getHistoricalBars', () => {
    it('should return historical bars', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const barsResp: HistoricalBarsResponse = {
        success: true,
        bars: [
          { timestamp: '2026-02-12T10:00:00Z', open: 18500, high: 18520, low: 18490, close: 18510, volume: 1000 },
          { timestamp: '2026-02-12T10:05:00Z', open: 18510, high: 18530, low: 18500, close: 18525, volume: 1200 },
        ],
        errorMessage: null,
      };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: barsResp },
      ]));

      const result = await client.getHistoricalBars({
        contractId: 'CON.F.US.ENQ.M25',
        barType: 'Minute',
        barInterval: 5,
        startDate: '2026-02-12T10:00:00Z',
        endDate: '2026-02-12T11:00:00Z',
      });

      expect(result.bars).toHaveLength(2);
      expect(result.bars![0].open).toBe(18500);
    });

    it('should handle empty bars response', async () => {
      const authResp: AuthResponse = { success: true, token: 'token', errorMessage: null };
      const barsResp: HistoricalBarsResponse = {
        success: true,
        bars: [],
        errorMessage: null,
      };
      vi.stubGlobal('fetch', mockFetch([
        { ok: true, json: authResp },
        { ok: true, json: barsResp },
      ]));

      const result = await client.getHistoricalBars({
        contractId: 'CON.F.US.ENQ.M25',
        barType: 'Minute',
        barInterval: 5,
        startDate: '2026-02-12T10:00:00Z',
        endDate: '2026-02-12T11:00:00Z',
      });

      expect(result.bars).toHaveLength(0);
    });
  });
});
