// TopstepX API types, enums, and constants
// Matches the actual ProjectX/TopstepX REST API contract

// ─── Order Enums (numeric values used by the API) ────────────────────────────

export enum OrderSide {
  BUY = 0,
  SELL = 1,
}

export enum OrderTypeNum {
  LIMIT = 1,
  MARKET = 2,
  STOP = 3, // NOT supported by TopstepX — use STOP_LIMIT
  STOP_LIMIT = 4,
}

export enum OrderStatusNum {
  PENDING = 0,
  OPEN = 1,
  FILLED = 2,
  CANCELLED = 3,
  REJECTED = 4,
  EXPIRED = 5,
}

// ─── API Response Wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  errorCode: number;
  errorMessage: string | null;
  /** The payload key varies by endpoint — callers destructure the specific field */
  [key: string]: T | boolean | number | string | null | undefined;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  success: boolean;
  token: string;
  errorCode: number;
  errorMessage: string | null;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface Account {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  isVisible: boolean;
  realizedPnl: number;
  unrealizedPnl: number;
  openPnl: number;
  maxLossLimit: number;
  dailyLossLimit: number;
  trailingDrawdown: number;
  startingBalance: number;
  totalPnl: number;
  marginUsed: number;
  buyingPower: number;
}

export interface AccountSearchResponse extends ApiResponse {
  accounts: Account[];
}

export interface AccountSummaryResponse extends ApiResponse {
  account: Account;
}

// ─── Contract ────────────────────────────────────────────────────────────────

export interface Contract {
  id: string;
  name: string;
  symbol: string;
  description: string;
  tickSize: number;
  tickValue: number;
}

export interface ContractSearchResponse extends ApiResponse {
  contracts: Contract[];
}

// ─── Order ───────────────────────────────────────────────────────────────────

export interface PlaceOrderParams {
  accountId: number;
  contractId: string;
  type: OrderTypeNum;
  side: OrderSide;
  size: number;
  limitPrice?: number;
  stopPrice?: number;
  customTag?: string;
}

export interface PlaceOrderResponse extends ApiResponse {
  orderId: number;
}

export interface CancelOrderParams {
  orderId: number;
  accountId?: number;
}

export interface Order {
  id: number;
  accountId: number;
  contractId: string;
  type: OrderTypeNum;
  side: OrderSide;
  size: number;
  limitPrice: number | null;
  stopPrice: number | null;
  status: OrderStatusNum;
  fillPrice: number | null;
  filledSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSearchResponse extends ApiResponse {
  orders: Order[];
}

// ─── Position ────────────────────────────────────────────────────────────────

export interface Position {
  accountId: number;
  contractId: string;
  size: number; // Positive = long, negative = short
  averagePrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface PositionListResponse extends ApiResponse {
  positions: Position[];
}

// ─── Trade (Fill) ────────────────────────────────────────────────────────────

export interface Trade {
  id: number;
  accountId: number;
  contractId: string;
  creationTimestamp: string;
  price: number;
  profitAndLoss: number;
  fees: number;
  side: number; // 0=BUY, 1=SELL (matches OrderSide enum)
  size: number;
  voided: boolean;
  orderId: number;
}

export interface TradeSearchResponse extends ApiResponse {
  trades: Trade[];
}

// ─── Historical Bars ─────────────────────────────────────────────────────────

export enum BarUnit {
  SECOND = 1,
  MINUTE = 2,
  DAY = 3,
}

export interface RetrieveBarsParams {
  contractId: string;
  live: boolean;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  unit: BarUnit;
  unitNumber: number;
  limit?: number;
}

export interface Bar {
  t: string; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  tickCount?: number;
}

export interface BarsResponse extends ApiResponse {
  bars: Bar[];
}

// ─── SignalR Event Data ──────────────────────────────────────────────────────

export interface GatewayOrderEvent {
  orderId: number;
  id: number;
  status: number;
  fillPrice: number | null;
  averageFillPrice: number | null;
  filledSize: number;
  size: number;
}

export interface GatewayPositionEvent {
  accountId: number;
  contractId: string;
  size: number;
  averagePrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface GatewayAccountEvent {
  id: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface GatewayTradeEvent {
  orderId: number;
  id: number;
  status: number;
  fillPrice: number | null;
  averageFillPrice: number | null;
  filledSize: number;
  size: number;
}

export interface GatewayQuoteEvent {
  contractId: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

export interface GatewayMarketTradeEvent {
  contractId: string;
  price: number;
  size: number;
  timestamp: string;
}

export interface GatewayDepthEvent {
  contractId: string;
  [key: string]: unknown;
}

// ─── Contract Specifications ─────────────────────────────────────────────────

export interface ContractSpec {
  name: string;
  tickSize: number;
  tickValue: number;
  pointValue: number;
  contractIdPrefix: string;
  marginDay: number;
  marginOvernight: number;
  expiryCycle: 'quarterly' | 'monthly' | 'quarterly_fjnv';
}

export const CONTRACT_SPECS: Record<string, ContractSpec> = {
  // ─── CME Equity Index Futures ─────────────────────────────────────────────
  ES: {
    name: 'E-mini S&P 500',
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.EP',
    marginDay: 500,
    marginOvernight: 12000,
    expiryCycle: 'quarterly',
  },
  MES: {
    name: 'Micro E-mini S&P 500',
    tickSize: 0.25,
    tickValue: 1.25,
    pointValue: 5.0,
    contractIdPrefix: 'CON.F.US.MES',
    marginDay: 50,
    marginOvernight: 1200,
    expiryCycle: 'quarterly',
  },
  NQ: {
    name: 'E-mini Nasdaq 100',
    tickSize: 0.25,
    tickValue: 5.0,
    pointValue: 20.0,
    contractIdPrefix: 'CON.F.US.ENQ',
    marginDay: 500,
    marginOvernight: 16000,
    expiryCycle: 'quarterly',
  },
  MNQ: {
    name: 'Micro E-mini Nasdaq 100',
    tickSize: 0.25,
    tickValue: 0.5,
    pointValue: 2.0,
    contractIdPrefix: 'CON.F.US.MNQ',
    marginDay: 50,
    marginOvernight: 1600,
    expiryCycle: 'quarterly',
  },
  YM: {
    name: 'Mini-DOW ($5)',
    tickSize: 1.0,
    tickValue: 5.0,
    pointValue: 5.0,
    contractIdPrefix: 'CON.F.US.YM',
    marginDay: 500,
    marginOvernight: 10000,
    expiryCycle: 'quarterly',
  },
  MYM: {
    name: 'Micro E-mini Dow',
    tickSize: 1.0,
    tickValue: 0.5,
    pointValue: 0.5,
    contractIdPrefix: 'CON.F.US.MYM',
    marginDay: 50,
    marginOvernight: 1200,
    expiryCycle: 'quarterly',
  },
  RTY: {
    name: 'E-mini Russell 2000',
    tickSize: 0.10,
    tickValue: 5.0,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.RTY',
    marginDay: 500,
    marginOvernight: 7000,
    expiryCycle: 'quarterly',
  },
  M2K: {
    name: 'Micro E-mini Russell 2000',
    tickSize: 0.10,
    tickValue: 0.5,
    pointValue: 5.0,
    contractIdPrefix: 'CON.F.US.M2K',
    marginDay: 50,
    marginOvernight: 700,
    expiryCycle: 'quarterly',
  },
  NKD: {
    name: 'Nikkei 225 ($5)',
    tickSize: 5.0,
    tickValue: 25.0,
    pointValue: 5.0,
    contractIdPrefix: 'CON.F.US.NKD',
    marginDay: 500,
    marginOvernight: 8000,
    expiryCycle: 'quarterly',
  },

  // ─── CME Crypto Futures ───────────────────────────────────────────────────
  MBT: {
    name: 'Micro Bitcoin',
    tickSize: 5.0,
    tickValue: 0.5,
    pointValue: 0.1,
    contractIdPrefix: 'CON.F.US.MBT',
    marginDay: 50,
    marginOvernight: 1600,
    expiryCycle: 'monthly',
  },
  MET: {
    name: 'Micro Ether',
    tickSize: 0.50,
    tickValue: 0.05,
    pointValue: 0.1,
    contractIdPrefix: 'CON.F.US.GMET',
    marginDay: 50,
    marginOvernight: 500,
    expiryCycle: 'monthly',
  },

  // ─── CME FX Futures ───────────────────────────────────────────────────────
  '6A': {
    name: 'Australian Dollar',
    tickSize: 0.00005,
    tickValue: 5.0,
    pointValue: 100000.0,
    contractIdPrefix: 'CON.F.US.DA6',
    marginDay: 500,
    marginOvernight: 2000,
    expiryCycle: 'quarterly',
  },
  '6B': {
    name: 'British Pound',
    tickSize: 0.0001,
    tickValue: 6.25,
    pointValue: 62500.0,
    contractIdPrefix: 'CON.F.US.BP6',
    marginDay: 500,
    marginOvernight: 2500,
    expiryCycle: 'quarterly',
  },
  '6C': {
    name: 'Canadian Dollar',
    tickSize: 0.00005,
    tickValue: 5.0,
    pointValue: 100000.0,
    contractIdPrefix: 'CON.F.US.CA6',
    marginDay: 500,
    marginOvernight: 1200,
    expiryCycle: 'quarterly',
  },
  '6E': {
    name: 'Euro FX',
    tickSize: 0.00005,
    tickValue: 6.25,
    pointValue: 125000.0,
    contractIdPrefix: 'CON.F.US.EU6',
    marginDay: 500,
    marginOvernight: 2600,
    expiryCycle: 'quarterly',
  },
  '6J': {
    name: 'Japanese Yen',
    tickSize: 0.0000005,
    tickValue: 6.25,
    pointValue: 12500000.0,
    contractIdPrefix: 'CON.F.US.JY6',
    marginDay: 500,
    marginOvernight: 3300,
    expiryCycle: 'quarterly',
  },
  '6S': {
    name: 'Swiss Franc',
    tickSize: 0.00005,
    tickValue: 6.25,
    pointValue: 125000.0,
    contractIdPrefix: 'CON.F.US.SF6',
    marginDay: 500,
    marginOvernight: 3000,
    expiryCycle: 'quarterly',
  },
  E7: {
    name: 'E-mini Euro FX',
    tickSize: 0.0001,
    tickValue: 6.25,
    pointValue: 62500.0,
    contractIdPrefix: 'CON.F.US.EEU',
    marginDay: 250,
    marginOvernight: 1300,
    expiryCycle: 'quarterly',
  },
  M6E: {
    name: 'Micro Euro FX',
    tickSize: 0.0001,
    tickValue: 1.25,
    pointValue: 12500.0,
    contractIdPrefix: 'CON.F.US.M6E',
    marginDay: 50,
    marginOvernight: 260,
    expiryCycle: 'quarterly',
  },
  M6A: {
    name: 'Micro AUD/USD',
    tickSize: 0.0001,
    tickValue: 1.0,
    pointValue: 10000.0,
    contractIdPrefix: 'CON.F.US.M6A',
    marginDay: 50,
    marginOvernight: 200,
    expiryCycle: 'quarterly',
  },
  M6B: {
    name: 'Micro GBP/USD',
    tickSize: 0.0001,
    tickValue: 0.625,
    pointValue: 6250.0,
    contractIdPrefix: 'CON.F.US.M6B',
    marginDay: 50,
    marginOvernight: 250,
    expiryCycle: 'quarterly',
  },
  '6M': {
    name: 'Mexican Peso',
    tickSize: 0.00001,
    tickValue: 5.0,
    pointValue: 500000.0,
    contractIdPrefix: 'CON.F.US.MX6',
    marginDay: 500,
    marginOvernight: 1500,
    expiryCycle: 'quarterly',
  },
  '6N': {
    name: 'New Zealand Dollar',
    tickSize: 0.00005,
    tickValue: 5.0,
    pointValue: 100000.0,
    contractIdPrefix: 'CON.F.US.NE6',
    marginDay: 500,
    marginOvernight: 1600,
    expiryCycle: 'quarterly',
  },

  // ─── CME NYMEX Energy Futures ─────────────────────────────────────────────
  CL: {
    name: 'Crude Oil (WTI)',
    tickSize: 0.01,
    tickValue: 10.0,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.CLE',
    marginDay: 500,
    marginOvernight: 7000,
    expiryCycle: 'monthly',
  },
  QM: {
    name: 'E-mini Crude Oil',
    tickSize: 0.025,
    tickValue: 12.5,
    pointValue: 500.0,
    contractIdPrefix: 'CON.F.US.NQM',
    marginDay: 250,
    marginOvernight: 3500,
    expiryCycle: 'monthly',
  },
  MCL: {
    name: 'Micro Crude Oil',
    tickSize: 0.01,
    tickValue: 1.0,
    pointValue: 100.0,
    contractIdPrefix: 'CON.F.US.MCLE',
    marginDay: 50,
    marginOvernight: 700,
    expiryCycle: 'monthly',
  },
  NG: {
    name: 'Natural Gas (Henry Hub)',
    tickSize: 0.001,
    tickValue: 10.0,
    pointValue: 10000.0,
    contractIdPrefix: 'CON.F.US.NGE',
    marginDay: 500,
    marginOvernight: 2500,
    expiryCycle: 'monthly',
  },
  QG: {
    name: 'E-mini Natural Gas',
    tickSize: 0.005,
    tickValue: 12.5,
    pointValue: 2500.0,
    contractIdPrefix: 'CON.F.US.NQG',
    marginDay: 50,
    marginOvernight: 500,
    expiryCycle: 'monthly',
  },
  MNG: {
    name: 'Micro Henry Hub Natural Gas',
    tickSize: 0.001,
    tickValue: 1.0,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.MNG',
    marginDay: 50,
    marginOvernight: 250,
    expiryCycle: 'monthly',
  },
  RB: {
    name: 'RBOB Gasoline',
    tickSize: 0.0001,
    tickValue: 4.2,
    pointValue: 42000.0,
    contractIdPrefix: 'CON.F.US.RBE',
    marginDay: 500,
    marginOvernight: 6500,
    expiryCycle: 'monthly',
  },
  HO: {
    name: 'Heating Oil',
    tickSize: 0.0001,
    tickValue: 4.2,
    pointValue: 42000.0,
    contractIdPrefix: 'CON.F.US.HOE',
    marginDay: 500,
    marginOvernight: 6500,
    expiryCycle: 'monthly',
  },

  // ─── CME COMEX Metals Futures ─────────────────────────────────────────────
  GC: {
    name: 'Gold',
    tickSize: 0.10,
    tickValue: 10.0,
    pointValue: 100.0,
    contractIdPrefix: 'CON.F.US.GCE',
    marginDay: 500,
    marginOvernight: 11000,
    expiryCycle: 'monthly',
  },
  MGC: {
    name: 'Micro Gold',
    tickSize: 0.1,
    tickValue: 1.0,
    pointValue: 10.0,
    contractIdPrefix: 'CON.F.US.MGC',
    marginDay: 50,
    marginOvernight: 1200,
    expiryCycle: 'monthly',
  },
  SI: {
    name: 'Silver',
    tickSize: 0.005,
    tickValue: 25.0,
    pointValue: 5000.0,
    contractIdPrefix: 'CON.F.US.SIE',
    marginDay: 500,
    marginOvernight: 9000,
    expiryCycle: 'monthly',
  },
  SIL: {
    name: 'Micro Silver',
    tickSize: 0.005,
    tickValue: 5.0,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.SIL',
    marginDay: 50,
    marginOvernight: 1800,
    expiryCycle: 'monthly',
  },
  HG: {
    name: 'Copper',
    tickSize: 0.0005,
    tickValue: 12.5,
    pointValue: 25000.0,
    contractIdPrefix: 'CON.F.US.CPE',
    marginDay: 500,
    marginOvernight: 5000,
    expiryCycle: 'monthly',
  },
  MHG: {
    name: 'Micro Copper',
    tickSize: 0.0005,
    tickValue: 1.25,
    pointValue: 2500.0,
    contractIdPrefix: 'CON.F.US.MHG',
    marginDay: 50,
    marginOvernight: 500,
    expiryCycle: 'monthly',
  },
  PL: {
    name: 'Platinum',
    tickSize: 0.10,
    tickValue: 5.0,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.PLE',
    marginDay: 500,
    marginOvernight: 3000,
    expiryCycle: 'quarterly_fjnv',
  },

  // ─── CBOT Agricultural Futures ────────────────────────────────────────────
  ZC: {
    name: 'Corn',
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.ZCE',
    marginDay: 500,
    marginOvernight: 1200,
    expiryCycle: 'monthly',
  },
  ZW: {
    name: 'Chicago SRW Wheat',
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.ZWA',
    marginDay: 500,
    marginOvernight: 1500,
    expiryCycle: 'monthly',
  },
  ZS: {
    name: 'Soybeans',
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50.0,
    contractIdPrefix: 'CON.F.US.ZSE',
    marginDay: 500,
    marginOvernight: 2200,
    expiryCycle: 'monthly',
  },
  ZM: {
    name: 'Soybean Meal',
    tickSize: 0.10,
    tickValue: 10.0,
    pointValue: 100.0,
    contractIdPrefix: 'CON.F.US.ZME',
    marginDay: 500,
    marginOvernight: 2000,
    expiryCycle: 'monthly',
  },
  ZL: {
    name: 'Soybean Oil',
    tickSize: 0.01,
    tickValue: 6.0,
    pointValue: 600.0,
    contractIdPrefix: 'CON.F.US.ZLE',
    marginDay: 500,
    marginOvernight: 1500,
    expiryCycle: 'monthly',
  },
  HE: {
    name: 'Lean Hogs',
    tickSize: 0.00025,
    tickValue: 10.0,
    pointValue: 40000.0,
    contractIdPrefix: 'CON.F.US.HE',
    marginDay: 500,
    marginOvernight: 1200,
    expiryCycle: 'monthly',
  },
  LE: {
    name: 'Live Cattle',
    tickSize: 0.025,
    tickValue: 10.0,
    pointValue: 400.0,
    contractIdPrefix: 'CON.F.US.GLE',
    marginDay: 500,
    marginOvernight: 1800,
    expiryCycle: 'monthly',
  },

  // ─── CBOT Interest Rate Futures ───────────────────────────────────────────
  ZT: {
    name: '2-Year T-Note',
    tickSize: 0.00390625,
    tickValue: 7.8125,
    pointValue: 2000.0,
    contractIdPrefix: 'CON.F.US.TUA',
    marginDay: 500,
    marginOvernight: 700,
    expiryCycle: 'quarterly',
  },
  ZF: {
    name: '5-Year T-Note',
    tickSize: 0.0078125,
    tickValue: 7.8125,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.FVA',
    marginDay: 500,
    marginOvernight: 900,
    expiryCycle: 'quarterly',
  },
  ZN: {
    name: '10-Year T-Note',
    tickSize: 0.015625,
    tickValue: 15.625,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.TYA',
    marginDay: 500,
    marginOvernight: 1500,
    expiryCycle: 'quarterly',
  },
  TN: {
    name: 'Ultra 10-Year T-Note',
    tickSize: 0.015625,
    tickValue: 15.625,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.TNA',
    marginDay: 500,
    marginOvernight: 2200,
    expiryCycle: 'quarterly',
  },
  ZB: {
    name: '30-Year T-Bond',
    tickSize: 0.03125,
    tickValue: 31.25,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.USA',
    marginDay: 500,
    marginOvernight: 3500,
    expiryCycle: 'quarterly',
  },
  UB: {
    name: 'Ultra T-Bond',
    tickSize: 0.03125,
    tickValue: 31.25,
    pointValue: 1000.0,
    contractIdPrefix: 'CON.F.US.ULA',
    marginDay: 500,
    marginOvernight: 5000,
    expiryCycle: 'quarterly',
  },
};

/**
 * Mini symbols that are equivalent to 10 micro contracts.
 * Used for position sizing: 1 mini = 10 micro-equivalent units.
 */
export const MINI_SYMBOLS = new Set([
  'ES', 'NQ', 'YM', 'RTY', 'NKD',  // Equity minis
  'NG', 'CL', 'QM', 'RB', 'HO',    // Energy full/mini
  'GC', 'SI', 'HG', 'PL',          // Metals full
  '6A', '6B', '6C', '6E', '6J', '6S', '6M', '6N', 'E7', // FX full/mini
  'ZC', 'ZW', 'ZS', 'ZM', 'ZL',   // Ags
  'HE', 'LE',                       // Livestock
  'ZT', 'ZF', 'ZN', 'TN', 'ZB', 'UB', // Interest rates
]);

/**
 * Get the micro-equivalent unit count for a symbol.
 * Mini contracts (ES, NQ) = 10 micro-equivalent units each.
 * Micro contracts (MES, MNQ, MYM, MGC, MCL, MBT) = 1 micro-equivalent unit each.
 */
export function getMicroEquivalent(symbol: string, quantity: number): number {
  return MINI_SYMBOLS.has(symbol) ? quantity * 10 : quantity;
}

/** Futures month codes: month number → letter */
export const EXPIRY_CODES: Record<number, string> = {
  1: 'F',
  2: 'G',
  3: 'H',
  4: 'J',
  5: 'K',
  6: 'M',
  7: 'N',
  8: 'Q',
  9: 'U',
  10: 'V',
  11: 'X',
  12: 'Z',
};
