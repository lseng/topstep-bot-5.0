// TopstepX REST API Client
// Ported from topstep-bot-3.0 Python implementation

import { logger } from '../../lib/logger';
import {
  OrderSide,
  OrderTypeNum,
  CONTRACT_SPECS,
  EXPIRY_CODES,
  type AuthResponse,
  type Account,
  type AccountSearchResponse,
  type AccountSummaryResponse,
  type Contract,
  type ContractSearchResponse,
  type PlaceOrderParams,
  type PlaceOrderResponse,
  type CancelOrderParams,
  type Order,
  type OrderSearchResponse,
  type Position,
  type PositionListResponse,
  type Trade,
  type TradeSearchResponse,
  type RetrieveBarsParams,
  type Bar,
  type BarsResponse,
} from './types';

// ─── Client State ────────────────────────────────────────────────────────────

let token: string | null = null;
let tokenExpires: Date | null = null;

function getApiUrl(): string {
  return process.env.TOPSTEPX_API_URL?.trim() || 'https://api.topstepx.com';
}

function getCredentials(): { username: string; apiKey: string } {
  const username = process.env.TOPSTEPX_USERNAME?.trim();
  const apiKey = process.env.TOPSTEPX_API_KEY?.trim();
  if (!username || !apiKey) {
    throw new Error('Missing TOPSTEPX_USERNAME or TOPSTEPX_API_KEY environment variables');
  }
  return { username, apiKey };
}

function isAuthenticated(): boolean {
  if (!token || !tokenExpires) return false;
  // Refresh if less than 1 hour remaining
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  return tokenExpires > oneHourFromNow;
}

async function getHeaders(): Promise<Record<string, string>> {
  if (!isAuthenticated()) {
    await authenticate();
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers = await getHeaders();
  const url = `${getApiUrl()}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TopstepX API ${path} failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as T;
  return data;
}

// ─── Authentication ──────────────────────────────────────────────────────────

export async function authenticate(): Promise<boolean> {
  const { username, apiKey } = getCredentials();
  const url = `${getApiUrl()}/Auth/loginKey`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: username, apiKey }),
    });

    if (!response.ok) {
      logger.error('Auth request failed', { status: response.status });
      return false;
    }

    const data = (await response.json()) as AuthResponse;

    if (data.success && data.token) {
      token = data.token;
      // Tokens valid 24h, refresh at 23h to be safe
      tokenExpires = new Date(Date.now() + 23 * 60 * 60 * 1000);
      logger.info('Authenticated with TopstepX API');
      return true;
    }

    logger.error('Authentication failed', { errorMessage: data.errorMessage });
    return false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Authentication error', { error: msg });
    return false;
  }
}

/** Returns the current JWT token (authenticates first if needed) */
export async function getToken(): Promise<string> {
  if (!isAuthenticated()) {
    const ok = await authenticate();
    if (!ok) throw new Error('Failed to authenticate with TopstepX');
  }
  return token!;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export async function getAccounts(onlyActive = true): Promise<Account[]> {
  const data = await apiPost<AccountSearchResponse>('/Account/search', {
    onlyActiveAccounts: onlyActive,
  });

  if (data.success) {
    logger.info('Fetched accounts', { count: data.accounts.length });
    return data.accounts;
  }

  logger.error('Failed to get accounts', { errorMessage: data.errorMessage });
  return [];
}

export async function getAccountSummary(accountId: number): Promise<Account | null> {
  try {
    const data = await apiPost<AccountSummaryResponse>('/Account/summary', { accountId });

    if (data.success && data.account) {
      return data.account;
    }
  } catch (error) {
    logger.warn('Account summary endpoint failed, falling back to search', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  // Fallback: find from search
  const accounts = await getAccounts();
  return accounts.find((a) => a.id === accountId) ?? null;
}

// ─── Contract ────────────────────────────────────────────────────────────────

export async function searchContracts(
  symbol: string,
  accountId?: number
): Promise<Contract[]> {
  const payload: Record<string, unknown> = {
    searchText: symbol,
    live: false,
  };
  if (accountId !== undefined) payload.accountId = accountId;

  try {
    const data = await apiPost<ContractSearchResponse>('/Contract/search', payload);

    if (data.success) {
      const filtered = data.contracts.filter(
        (c) =>
          c.name?.toUpperCase().includes(symbol.toUpperCase()) ||
          c.symbol?.toUpperCase().includes(symbol.toUpperCase())
      );
      logger.info('Found contracts', { symbol, count: filtered.length });
      return filtered;
    }

    logger.error('Contract search failed', { errorMessage: data.errorMessage });
    return [];
  } catch (error) {
    logger.error('Contract search error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

/**
 * Calculate the current front-month contract ID.
 * Quarterly futures (ES, NQ, MES, MNQ, MYM): Mar(H), Jun(M), Sep(U), Dec(Z)
 * Monthly futures (MGC, MCL, MBT): every month
 * Rolls after day 19 of expiry month.
 */
export function getCurrentContractId(symbol = 'ES'): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const day = now.getDate();
  let year = now.getFullYear();

  const spec = CONTRACT_SPECS[symbol.toUpperCase()] ?? CONTRACT_SPECS['ES'];

  const expiryMonths =
    spec.expiryCycle === 'monthly'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : [3, 6, 9, 12];

  let expiryMonth: number;

  const idx = expiryMonths.indexOf(month);
  if (idx !== -1 && day <= 19) {
    // In an expiry month before rollover
    expiryMonth = month;
  } else {
    // Find next expiry month
    const next = expiryMonths.find((m) => m > month);
    if (next) {
      expiryMonth = next;
    } else {
      expiryMonth = expiryMonths[0];
      year += 1;
    }
  }

  const expiryCode = EXPIRY_CODES[expiryMonth];
  const yearCode = String(year).slice(-2);

  return `${spec.contractIdPrefix}.${expiryCode}${yearCode}`;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResponse> {
  const payload: Record<string, unknown> = {
    accountId: params.accountId,
    contractId: params.contractId,
    type: params.type,
    side: params.side,
    size: params.size,
  };
  if (params.limitPrice !== undefined) payload.limitPrice = params.limitPrice;
  if (params.stopPrice !== undefined) payload.stopPrice = params.stopPrice;
  if (params.customTag !== undefined) payload.customTag = params.customTag;

  logger.info('Placing order', {
    contractId: params.contractId,
    side: OrderSide[params.side],
    type: OrderTypeNum[params.type],
    size: params.size,
  });

  const data = await apiPost<PlaceOrderResponse>('/Order/place', payload);

  if (data.success) {
    logger.info('Order placed', { orderId: data.orderId });
  } else {
    logger.error('Order failed', { errorMessage: data.errorMessage });
  }

  return data;
}

export async function cancelOrder(params: CancelOrderParams): Promise<boolean> {
  const payload: Record<string, unknown> = { orderId: params.orderId };
  if (params.accountId !== undefined) payload.accountId = params.accountId;

  logger.info('Cancelling order', { orderId: params.orderId });

  const data = await apiPost<{ success: boolean; errorMessage?: string }>(
    '/Order/cancel',
    payload
  );

  if (data.success) {
    logger.info('Order cancelled', { orderId: params.orderId });
  } else {
    logger.error('Cancel failed', { orderId: params.orderId, errorMessage: data.errorMessage });
  }

  return data.success;
}

export async function getOrders(accountId: number, daysBack = 7): Promise<Order[]> {
  const startTimestamp = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  try {
    const data = await apiPost<OrderSearchResponse>('/Order/search', {
      accountId,
      startTimestamp,
      request: {},
    });

    if (data.success) {
      return data.orders ?? [];
    }

    logger.error('Get orders failed', { errorMessage: data.errorMessage });
    return [];
  } catch (error) {
    logger.error('Get orders error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

// ─── Positions ───────────────────────────────────────────────────────────────

export async function getPositions(accountId: number): Promise<Position[]> {
  // Try Position/list first (newer API)
  try {
    const data = await apiPost<PositionListResponse>('/Position/list', { accountId });
    if (data.success) return data.positions ?? [];
  } catch {
    logger.warn('Position/list failed, trying Position/search');
  }

  // Fallback to Position/search
  try {
    const data = await apiPost<PositionListResponse>('/Position/search', { accountId });
    if (data.success) return data.positions ?? [];
  } catch {
    logger.warn('Position/search also failed');
  }

  return [];
}

/**
 * Close an open position by placing an opposite market order.
 */
export async function closePosition(
  accountId: number,
  contractId: string,
  size: number,
  isLong: boolean
): Promise<PlaceOrderResponse> {
  const side = isLong ? OrderSide.SELL : OrderSide.BUY;

  logger.info('Closing position', {
    contractId,
    size: Math.abs(size),
    direction: isLong ? 'long' : 'short',
  });

  return placeOrder({
    accountId,
    contractId,
    side,
    size: Math.abs(size),
    type: OrderTypeNum.MARKET,
    customTag: 'BOT',
  });
}

// ─── Trades (Fills) ──────────────────────────────────────────────────────────

export async function getTrades(
  accountId: number,
  daysBack = 30,
  limit = 500
): Promise<Trade[]> {
  const startTimestamp = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  try {
    const data = await apiPost<TradeSearchResponse>('/Trade/search', {
      accountId,
      startTimestamp,
    });

    if (data.success) {
      const trades = (data.trades ?? []).filter((t) => !t.voided);
      return trades.slice(0, limit);
    }

    logger.error('Get trades failed', { errorMessage: data.errorMessage });
    return [];
  } catch (error) {
    logger.error('Get trades error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

// ─── Historical Bars ─────────────────────────────────────────────────────────

export async function getHistoricalBars(params: RetrieveBarsParams): Promise<Bar[]> {
  const payload: Record<string, unknown> = {
    contractId: params.contractId,
    live: params.live,
    startTime: params.startTime,
    endTime: params.endTime,
    unit: params.unit,
    unitNumber: params.unitNumber,
  };
  payload.limit = params.limit ?? 500;

  try {
    const data = await apiPost<BarsResponse>('/History/retrieveBars', payload);

    if (data.success) {
      return data.bars ?? [];
    }

    logger.error('Get bars failed', { errorMessage: data.errorMessage });
    return [];
  } catch (error) {
    logger.error('Get bars error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}
