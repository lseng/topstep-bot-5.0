# TopstepX Integration Specification

## Overview

Integration with TopstepX via the ProjectX Gateway API for automated trading execution.

## Authentication

### API Credentials
- **Username**: TopstepX account username
- **API Key**: Generated in ProjectX settings ($29/month, 50% off for TopstepX traders)

### Token Flow
1. Authenticate with username + API key
2. Receive JWT token
3. Use token in Authorization header
4. Refresh token before expiry

### API Endpoint
```
POST https://api.topstepx.com/api/auth
```

### Token Response
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-02-02T14:00:00Z"
}
```

## Order Management

### Place Order
```
POST https://api.topstepx.com/api/orders
```

#### Request
```json
{
  "accountId": "123456",
  "symbol": "MNQ",
  "side": "Buy",
  "quantity": 1,
  "orderType": "Market",
  "timeInForce": "Day"
}
```

#### Order Types
| Type | Description |
|------|-------------|
| Market | Execute immediately at best price |
| Limit | Execute at specified price or better |
| Stop | Trigger market order at stop price |
| StopLimit | Trigger limit order at stop price |

#### Time in Force
| Value | Description |
|-------|-------------|
| Day | Valid until end of trading day |
| GTC | Good 'til canceled |
| IOC | Immediate or cancel |
| FOK | Fill or kill |

### Cancel Order
```
DELETE https://api.topstepx.com/api/orders/{orderId}
```

### Modify Order
```
PUT https://api.topstepx.com/api/orders/{orderId}
```

## Position Management

### Get Open Positions
```
GET https://api.topstepx.com/api/positions
```

#### Response
```json
{
  "positions": [
    {
      "symbol": "MNQ",
      "quantity": 2,
      "side": "Long",
      "entryPrice": 18450.25,
      "currentPrice": 18475.50,
      "unrealizedPnL": 50.50,
      "accountId": "123456"
    }
  ]
}
```

### Close Position
```
POST https://api.topstepx.com/api/positions/close
```

#### Request
```json
{
  "accountId": "123456",
  "symbol": "MNQ",
  "quantity": 1
}
```

## Account Information

### Get Account
```
GET https://api.topstepx.com/api/accounts
```

#### Response
```json
{
  "accounts": [
    {
      "accountId": "123456",
      "accountName": "Express Funded 50K",
      "balance": 50000.00,
      "buyingPower": 45000.00,
      "unrealizedPnL": 125.50,
      "realizedPnL": 350.00
    }
  ]
}
```

## Real-time Updates (SignalR)

### User Hub
```
wss://rtc.topstepx.com/hubs/user
```

#### Events
| Event | Description |
|-------|-------------|
| GatewayUserAccount | Account balance updates |
| GatewayUserOrder | Order status changes |
| GatewayUserPosition | Position updates |
| GatewayUserTrade | Trade executions |

### Market Hub
```
wss://rtc.topstepx.com/hubs/market
```

#### Events
| Event | Description |
|-------|-------------|
| GatewayQuote | Bid/ask quotes |
| GatewayDepth | DOM/market depth |
| GatewayTrade | Market trades |

### Connection
```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl("https://rtc.topstepx.com/hubs/user", {
    accessTokenFactory: () => jwtToken
  })
  .withAutomaticReconnect()
  .build();

connection.on("GatewayUserOrder", (order) => {
  console.log("Order update:", order);
});
```

## Error Handling

### HTTP Status Codes
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Server error |

### Error Response
```json
{
  "error": "OrderRejected",
  "message": "Insufficient buying power",
  "details": {
    "required": 5000.00,
    "available": 3500.00
  }
}
```

## Rate Limits

- **REST API**: 60 requests/minute, burst of 10
- **WebSocket**: No explicit limit, but respect connection guidelines

### Retry Strategy
1. On 429: Wait for `Retry-After` header duration
2. On 5xx: Exponential backoff (1s, 2s, 4s), max 3 retries
3. On 401: Refresh token, retry once

## Symbol Mapping

| TradingView | TopstepX | Description |
|-------------|----------|-------------|
| MNQ1! | MNQ | Micro E-mini Nasdaq |
| MES1! | MES | Micro E-mini S&P 500 |
| ES1! | ES | E-mini S&P 500 |
| NQ1! | NQ | E-mini Nasdaq |
| YM1! | YM | Mini Dow |
| RTY1! | RTY | Mini Russell 2000 |
| CL1! | CL | Crude Oil |
| GC1! | GC | Gold |
