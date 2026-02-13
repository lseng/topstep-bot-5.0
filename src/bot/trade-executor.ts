// Trade executor — wraps TopstepX client with dry-run support

import { logger } from '../lib/logger';
import {
  placeOrder,
  cancelOrder,
  closePosition,
  getCurrentContractId,
} from '../services/topstepx/client';
import { OrderSide, OrderTypeNum } from '../services/topstepx/types';
import type { PlaceOrderResponse } from '../services/topstepx/types';
import type { PositionSide } from './types';

export class TradeExecutor {
  private dryRun: boolean;

  constructor(dryRun = false) {
    this.dryRun = dryRun;
  }

  /**
   * Place a limit entry order.
   */
  async placeLimitEntry(
    symbol: string,
    side: PositionSide,
    price: number,
    quantity: number,
    accountId: number,
  ): Promise<PlaceOrderResponse> {
    const contractId = getCurrentContractId(symbol);
    const orderSide = side === 'long' ? OrderSide.BUY : OrderSide.SELL;

    if (this.dryRun) {
      logger.info('[DRY-RUN] Would place limit entry', {
        symbol,
        side,
        price,
        quantity,
        contractId,
      });
      return { success: true, orderId: -1, errorCode: 0, errorMessage: null };
    }

    return placeOrder({
      accountId,
      contractId,
      type: OrderTypeNum.LIMIT,
      side: orderSide,
      size: quantity,
      limitPrice: price,
      customTag: 'BOT',
    });
  }

  /**
   * Cancel a pending entry order.
   */
  async cancelEntry(orderId: number, accountId: number): Promise<boolean> {
    if (this.dryRun) {
      logger.info('[DRY-RUN] Would cancel order', { orderId });
      return true;
    }

    return cancelOrder({ orderId, accountId });
  }

  /**
   * Market close a position.
   */
  async marketClose(
    symbol: string,
    side: PositionSide,
    quantity: number,
    accountId: number,
  ): Promise<PlaceOrderResponse> {
    const contractId = getCurrentContractId(symbol);
    const isLong = side === 'long';

    if (this.dryRun) {
      logger.info('[DRY-RUN] Would market close', {
        symbol,
        side,
        quantity,
        contractId,
      });
      return { success: true, orderId: -1, errorCode: 0, errorMessage: null };
    }

    return closePosition(accountId, contractId, quantity, isLong);
  }
}
