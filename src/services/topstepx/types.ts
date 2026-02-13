// TopstepX ProjectX Gateway API Types

/** Authentication request payload */
export interface AuthRequest {
  userName: string;
  apiKey: string;
}

/** Authentication response from /api/Auth/loginKey */
export interface AuthResponse {
  success: boolean;
  token: string | null;
  errorMessage: string | null;
}

/** Cached auth token with expiry tracking */
export interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp ms
}

/** Order side for the ProjectX API */
export type ApiOrderSide = 'Buy' | 'Sell';

/** Order type for the ProjectX API */
export type ApiOrderType = 'Market' | 'Limit' | 'Stop' | 'StopLimit';

/** Time in force for orders */
export type TimeInForce = 'Day' | 'GTC' | 'IOC' | 'FOK';

/** Order placement request */
export interface PlaceOrderRequest {
  accountId: number;
  contractId: string;
  type: ApiOrderType;
  side: ApiOrderSide;
  size: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
}

/** Order response from the API */
export interface OrderResponse {
  success: boolean;
  orderId: number | null;
  errorMessage: string | null;
}

/** Cancel order request */
export interface CancelOrderRequest {
  orderId: number;
  accountId: number;
}

/** Account info from /api/Account/search */
export interface AccountInfo {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
}

/** Account search response */
export interface AccountSearchResponse {
  success: boolean;
  accounts: AccountInfo[] | null;
  errorMessage: string | null;
}

/** Position info from /api/Position/search */
export interface PositionInfo {
  accountId: number;
  contractId: string;
  contractName: string;
  averagePrice: number;
  size: number; // positive = long, negative = short
  unrealizedPnL: number;
}

/** Position search response */
export interface PositionSearchResponse {
  success: boolean;
  positions: PositionInfo[] | null;
  errorMessage: string | null;
}

/** Historical bar (OHLCV) from /api/History/bars */
export interface HistoricalBar {
  timestamp: string; // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Historical bars request params */
export interface HistoricalBarsRequest {
  contractId: string;
  barType: 'Minute' | 'Hour' | 'Day';
  barInterval: number; // e.g., 5 for 5-minute bars
  startDate: string; // ISO date
  endDate: string; // ISO date
}

/** Historical bars response */
export interface HistoricalBarsResponse {
  success: boolean;
  bars: HistoricalBar[] | null;
  errorMessage: string | null;
}

// --- SignalR Hub Message Types ---

/** Market Hub tick event */
export interface MarketTick {
  contractId: string;
  price: number;
  size: number;
  timestamp: string;
  side: 'Bid' | 'Ask' | 'Trade';
}

/** User Hub order fill event */
export interface OrderFillEvent {
  orderId: number;
  accountId: number;
  contractId: string;
  side: ApiOrderSide;
  size: number;
  price: number;
  timestamp: string;
}

/** User Hub order status update event */
export interface OrderStatusEvent {
  orderId: number;
  accountId: number;
  status: 'Working' | 'Filled' | 'Cancelled' | 'Rejected';
  filledSize: number;
  filledPrice: number | null;
  timestamp: string;
}

/** User Hub position update event */
export interface PositionUpdateEvent {
  accountId: number;
  contractId: string;
  size: number;
  averagePrice: number;
  unrealizedPnL: number;
}

/** SignalR connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** TopstepX client configuration */
export interface TopstepXConfig {
  baseUrl: string;
  username: string;
  apiKey: string;
}

/** SignalR streaming configuration */
export interface StreamingConfig {
  marketHubUrl: string;
  userHubUrl: string;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}
