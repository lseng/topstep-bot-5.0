import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeExecutor } from './trade-executor';

// Mock the TopstepX client module
vi.mock('../services/topstepx/client', () => ({
  placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 100, errorCode: 0, errorMessage: null }),
  cancelOrder: vi.fn().mockResolvedValue(true),
  closePosition: vi.fn().mockResolvedValue({ success: true, orderId: 101, errorCode: 0, errorMessage: null }),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.EPH26'),
}));

// Import after mock
import { placeOrder, cancelOrder, closePosition } from '../services/topstepx/client';
import { OrderSide, OrderTypeNum } from '../services/topstepx/types';

const mockPlaceOrder = vi.mocked(placeOrder);
const mockCancelOrder = vi.mocked(cancelOrder);
const mockClosePosition = vi.mocked(closePosition);

describe('TradeExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('placeLimitEntry', () => {
    it('places a LIMIT BUY order for long side', async () => {
      const executor = new TradeExecutor(false);
      const result = await executor.placeLimitEntry('ES', 'long', 5020, 1, 1001);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(100);
      expect(mockPlaceOrder).toHaveBeenCalledWith({
        accountId: 1001,
        contractId: 'CON.F.US.EPH26',
        type: OrderTypeNum.LIMIT,
        side: OrderSide.BUY,
        size: 1,
        limitPrice: 5020,
        customTag: 'BOT',
      });
    });

    it('places a LIMIT SELL order for short side', async () => {
      const executor = new TradeExecutor(false);
      await executor.placeLimitEntry('ES', 'short', 5080, 1, 1001);

      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: OrderSide.SELL }),
      );
    });

    it('dry-run mode does not call API', async () => {
      const executor = new TradeExecutor(true);
      const result = await executor.placeLimitEntry('ES', 'long', 5020, 1, 1001);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(-1);
      expect(mockPlaceOrder).not.toHaveBeenCalled();
    });
  });

  describe('cancelEntry', () => {
    it('cancels an order via API', async () => {
      const executor = new TradeExecutor(false);
      const result = await executor.cancelEntry(100, 1001);

      expect(result).toBe(true);
      expect(mockCancelOrder).toHaveBeenCalledWith({ orderId: 100, accountId: 1001 });
    });

    it('dry-run mode does not call API', async () => {
      const executor = new TradeExecutor(true);
      const result = await executor.cancelEntry(100, 1001);

      expect(result).toBe(true);
      expect(mockCancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('marketClose', () => {
    it('market closes a long position', async () => {
      const executor = new TradeExecutor(false);
      const result = await executor.marketClose('ES', 'long', 1, 1001);

      expect(result.success).toBe(true);
      expect(mockClosePosition).toHaveBeenCalledWith(1001, 'CON.F.US.EPH26', 1, true);
    });

    it('market closes a short position', async () => {
      const executor = new TradeExecutor(false);
      await executor.marketClose('ES', 'short', 1, 1001);

      expect(mockClosePosition).toHaveBeenCalledWith(1001, 'CON.F.US.EPH26', 1, false);
    });

    it('dry-run mode does not call API', async () => {
      const executor = new TradeExecutor(true);
      const result = await executor.marketClose('ES', 'long', 1, 1001);

      expect(result.success).toBe(true);
      expect(mockClosePosition).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('propagates API errors for placeOrder', async () => {
      mockPlaceOrder.mockRejectedValueOnce(new Error('Network error'));
      const executor = new TradeExecutor(false);

      await expect(executor.placeLimitEntry('ES', 'long', 5020, 1, 1001)).rejects.toThrow(
        'Network error',
      );
    });
  });
});
