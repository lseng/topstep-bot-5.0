// TopstepX Trading Bot - Type Definitions

/**
 * TradingView Webhook Alert Payload (original format)
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
 * TradingView Alert Payload - supports TradingView placeholder variables
 * Can use `ticker` instead of `symbol`, and `quantity` defaults to 1
 */
export interface TradingViewAlert {
  secret: string;
  ticker?: string; // Maps to symbol, uses {{ticker}} placeholder
  symbol?: string; // Alternative to ticker
  action: TradeAction;
  quantity?: number; // Optional, defaults to 1
  interval?: string; // Timeframe: 1, 5, 15, 60, D, W, M
  time?: string; // ISO timestamp from {{time}} placeholder
  /** Alert name from TradingView (e.g. 'day-trader-medium-term-13'). Used for multi-account routing. */
  name?: string;
  // OHLCV data from TradingView bar
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  // Original optional fields
  orderType?: OrderType;
  price?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  /** Trading strategy identifier (e.g. 'vpvr', 'scalper'). Defaults to 'vpvr'. */
  strategy?: string;
}

/**
 * OHLCV bar data extracted from TradingView alert
 */
export interface OHLCVData {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

/**
 * Parsed webhook payload - normalized from TradingView format
 * Symbol is guaranteed, quantity defaults to 1
 */
export interface ParsedWebhookPayload {
  secret: string;
  symbol: string; // Normalized from ticker or symbol
  action: TradeAction;
  quantity: number; // Guaranteed, defaults to 1
  interval?: string;
  alertTime?: Date; // Parsed from time field
  ohlcv?: OHLCVData;
  /** Alert name from TradingView (e.g. 'day-trader-medium-term-13'). Used for multi-account routing. */
  name?: string;
  orderType?: OrderType;
  price?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  /** Trading strategy identifier (e.g. 'vpvr', 'scalper'). Defaults to 'vpvr'. */
  strategy?: string;
}

/**
 * Supported payload formats for webhook parsing
 */
export type PayloadFormat = 'json' | 'csv';

/**
 * Trade actions supported by the webhook
 */
export type TradeAction = 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';

/**
 * Order types supported by TopstepX
 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/**
 * TopstepX API Order (matches actual ProjectX API)
 * Side: 0=SELL, 1=BUY
 * Type: 1=LIMIT, 2=MARKET, 3=STOP (unsupported), 4=STOP_LIMIT
 */
export interface TopstepXOrder {
  accountId: number;
  contractId: string;
  type: number;
  side: number;
  size: number;
  limitPrice?: number;
  stopPrice?: number;
  customTag?: string;
}

/**
 * TopstepX Order Response
 */
export interface TopstepXOrderResponse {
  success: boolean;
  orderId: number;
  errorCode: number;
  errorMessage: string | null;
}

/**
 * Order status codes from TopstepX
 * 0=PENDING, 1=OPEN, 2=FILLED, 3=CANCELLED, 4=REJECTED, 5=EXPIRED
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
 * size > 0 = long, size < 0 = short
 */
export interface TopstepXPosition {
  accountId: number;
  contractId: string;
  size: number;
  averagePrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

/**
 * TopstepX Account
 */
export interface TopstepXAccount {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  buyingPower: number;
  unrealizedPnl: number;
  realizedPnl: number;
  maxLossLimit: number;
  dailyLossLimit: number;
  startingBalance: number;
}

/**
 * TopstepX Authentication Response
 */
export interface TopstepXAuthResponse {
  success: boolean;
  token: string;
  errorCode: number;
  errorMessage: string | null;
}

/**
 * Webhook API Response
 */
export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    alertId?: string;
    orderId: string;
    symbol: string;
    action: TradeAction;
    quantity: number;
    status: OrderStatus;
    filledPrice?: number;
    timestamp: string;
    confirmation?: {
      confirmed: boolean;
      score: number;
      level: string;
      summary: string;
    };
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

/**
 * Database connection status
 */
export interface DatabaseStatus {
  connected: boolean;
  error?: string;
}

/**
 * Alert record stored in database
 */
export interface AlertRecord {
  id: string;
  secret_hash: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  interval?: string | null;
  alert_time?: Date | null;
  open_price?: number | null;
  high_price?: number | null;
  low_price?: number | null;
  close_price?: number | null;
  bar_volume?: number | null;
  order_type?: OrderType | null;
  price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  comment?: string | null;
  status: AlertStatus;
  created_at: Date;
}

/**
 * Alert processing status
 */
export type AlertStatus = 'received' | 'processing' | 'executed' | 'failed';

/**
 * Query parameters for GET /api/alerts
 */
export interface AlertsQuery {
  page?: number;
  limit?: number;
  symbol?: string;
  action?: TradeAction;
  status?: AlertStatus;
  sort?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response for GET /api/alerts
 */
export interface AlertsResponse {
  success: true;
  data: import('./database').AlertRow[];
  pagination: PaginationMeta;
}

/**
 * Response for GET /api/alerts/[id]
 */
export interface AlertDetailResponse {
  success: true;
  data: import('./database').AlertRow & {
    ohlcv?: {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
    };
  };
}
