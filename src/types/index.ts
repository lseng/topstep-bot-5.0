// TopstepX Trading Bot - Type Definitions

/**
 * TradingView Webhook Alert Payload
 */
export interface WebhookAlert {
  secret: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  orderType?: OrderType;
  price?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

/**
 * Trade actions supported by the webhook
 */
export type TradeAction = 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';

/**
 * Order types supported by TopstepX
 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/**
 * TopstepX API Order
 */
export interface TopstepXOrder {
  accountId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  orderType: 'Market' | 'Limit' | 'Stop' | 'StopLimit';
  price?: number;
  stopPrice?: number;
  timeInForce: 'Day' | 'GTC' | 'IOC' | 'FOK';
}

/**
 * TopstepX Order Response
 */
export interface TopstepXOrderResponse {
  orderId: string;
  accountId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
  filledPrice?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Order status from TopstepX
 */
export type OrderStatus =
  | 'Pending'
  | 'Working'
  | 'Filled'
  | 'PartiallyFilled'
  | 'Cancelled'
  | 'Rejected';

/**
 * TopstepX Position
 */
export interface TopstepXPosition {
  symbol: string;
  quantity: number;
  side: 'Long' | 'Short';
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  accountId: string;
}

/**
 * TopstepX Account
 */
export interface TopstepXAccount {
  accountId: string;
  accountName: string;
  balance: number;
  buyingPower: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

/**
 * TopstepX Authentication Response
 */
export interface TopstepXAuthResponse {
  token: string;
  expiresAt: string;
}

/**
 * Webhook API Response
 */
export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    orderId: string;
    symbol: string;
    action: TradeAction;
    quantity: number;
    status: OrderStatus;
    filledPrice?: number;
    timestamp: string;
  };
  details?: string | ValidationError[];
}

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Logger levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}
