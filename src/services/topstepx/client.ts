// TopstepX ProjectX Gateway REST Client

import type {
  TopstepXConfig,
  CachedToken,
  AuthResponse,
  PlaceOrderRequest,
  OrderResponse,
  CancelOrderRequest,
  AccountSearchResponse,
  PositionSearchResponse,
  HistoricalBarsRequest,
  HistoricalBarsResponse,
} from './types';

const TOKEN_EXPIRY_MS = 55 * 60 * 1000; // 55 minutes (tokens last ~60 min)

export class TopstepXClient {
  private config: TopstepXConfig;
  private cachedToken: CachedToken | null = null;

  constructor(config: TopstepXConfig) {
    this.config = config;
  }

  /** Get a valid auth token, using cache if available */
  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }
    return this.authenticate();
  }

  /** Authenticate with the ProjectX Gateway API */
  private async authenticate(): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/api/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: this.config.username,
        apiKey: this.config.apiKey,
      }),
    });

    if (!res.ok) {
      throw new Error(`Auth request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as AuthResponse;
    if (!data.success || !data.token) {
      throw new Error(`Auth failed: ${data.errorMessage || 'No token returned'}`);
    }

    this.cachedToken = {
      token: data.token,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    };

    return data.token;
  }

  /** Make an authenticated API request */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`API request failed: ${res.status} ${res.statusText} - ${path}`);
    }

    return (await res.json()) as T;
  }

  /** Place an order */
  async placeOrder(order: PlaceOrderRequest): Promise<OrderResponse> {
    return this.request<OrderResponse>('/api/Order/place', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  /** Cancel an order */
  async cancelOrder(req: CancelOrderRequest): Promise<OrderResponse> {
    return this.request<OrderResponse>('/api/Order/cancel', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Search for accounts */
  async searchAccounts(): Promise<AccountSearchResponse> {
    return this.request<AccountSearchResponse>('/api/Account/search', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** Search for open positions */
  async searchPositions(accountId: number): Promise<PositionSearchResponse> {
    return this.request<PositionSearchResponse>('/api/Position/search', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    });
  }

  /** Fetch historical bars (OHLCV) */
  async getHistoricalBars(req: HistoricalBarsRequest): Promise<HistoricalBarsResponse> {
    return this.request<HistoricalBarsResponse>('/api/History/bars', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /** Clear the cached auth token (for testing or forced re-auth) */
  clearTokenCache(): void {
    this.cachedToken = null;
  }
}
