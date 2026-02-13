import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeExecutor } from './trade-executor';
import type { ManagedPosition } from './types';
import type { TopstepXClient } from '../services/topstepx/client';

const mockPosition: ManagedPosition = {
  id: 'pos-1',
  alertId: 'alert-1',
  symbol: 'NQ',
  side: 'long',
  state: 'pending_entry',
  quantity: 1,
  contractId: 'CON.F.US.ENQ.M25',
  accountId: 1,
  entryOrderId: null,
  targetEntryPrice: 18450,
  entryPrice: null,
  tp1Price: 18500,
  tp2Price: 18550,
  tp3Price: 18600,
  initialSl: 18425,
  currentSl: 18425,
  lastPrice: null,
  unrealizedPnl: 0,
  vpvrData: { poc: 18500, vah: 18550, val: 18450, rangeHigh: 18600, rangeLow: 18400, profileBins: [], totalVolume: 50000 },
  confirmationScore: 85,
  llmReasoning: null,
  llmConfidence: null,
  createdAt: new Date(),
  exitPrice: null,
  exitReason: null,
  closedAt: null,
  dirty: false,
};

function createMockClient(): TopstepXClient {
  return {
    placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 12345, errorMessage: null }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true, orderId: 12345, errorMessage: null }),
  } as unknown as TopstepXClient;
}

describe('TradeExecutor', () => {
  describe('live mode', () => {
    let executor: TradeExecutor;
    let client: TopstepXClient;

    beforeEach(() => {
      client = createMockClient();
      executor = new TradeExecutor(client, false);
    });

    it('should place a limit buy order for long position', async () => {
      const result = await executor.placeLimitOrder(mockPosition);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe(12345);
      expect(client.placeOrder).toHaveBeenCalledWith({
        accountId: 1,
        contractId: 'CON.F.US.ENQ.M25',
        type: 'Limit',
        side: 'Buy',
        size: 1,
        limitPrice: 18450,
      });
    });

    it('should place a limit sell order for short position', async () => {
      const shortPos = { ...mockPosition, side: 'short' as const, targetEntryPrice: 18550 };
      await executor.placeLimitOrder(shortPos);
      expect(client.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'Sell', limitPrice: 18550 })
      );
    });

    it('should cancel an order', async () => {
      const result = await executor.cancelOrder(12345, 1);
      expect(result.success).toBe(true);
      expect(client.cancelOrder).toHaveBeenCalledWith({ orderId: 12345, accountId: 1 });
    });

    it('should close a long position with a sell market order', async () => {
      const activePos = { ...mockPosition, state: 'active' as const };
      await executor.closePosition(activePos);
      expect(client.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Market', side: 'Sell' })
      );
    });

    it('should close a short position with a buy market order', async () => {
      const shortPos = { ...mockPosition, side: 'short' as const, state: 'active' as const };
      await executor.closePosition(shortPos);
      expect(client.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Market', side: 'Buy' })
      );
    });
  });

  describe('dry-run mode', () => {
    let executor: TradeExecutor;
    let client: TopstepXClient;

    beforeEach(() => {
      client = createMockClient();
      executor = new TradeExecutor(client, true);
    });

    it('should not call client for limit order in dry-run', async () => {
      const result = await executor.placeLimitOrder(mockPosition);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe(-1);
      expect(client.placeOrder).not.toHaveBeenCalled();
    });

    it('should not call client for cancel in dry-run', async () => {
      const result = await executor.cancelOrder(12345, 1);
      expect(result.success).toBe(true);
      expect(client.cancelOrder).not.toHaveBeenCalled();
    });

    it('should not call client for close in dry-run', async () => {
      const result = await executor.closePosition(mockPosition);
      expect(result.success).toBe(true);
      expect(client.placeOrder).not.toHaveBeenCalled();
    });
  });
});
