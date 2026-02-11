# Webhook API Specification

## Endpoint

```
POST /api/webhook
```

## Authentication

The webhook validates incoming requests using a shared secret.

### Headers
```
Content-Type: application/json
```

### Body (Required)
The `secret` field must match the `WEBHOOK_SECRET` environment variable.

## Request Format

### JSON Format (Recommended)
```json
{
  "secret": "your-webhook-secret",
  "symbol": "MNQ",
  "action": "buy",
  "quantity": 1,
  "orderType": "market",
  "price": null,
  "stopLoss": 50,
  "takeProfit": 100,
  "comment": "Long entry signal"
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| secret | string | Yes | Webhook authentication secret |
| symbol | string | Yes | Trading symbol (e.g., "MNQ", "MES", "ES") |
| action | string | Yes | Trade action: "buy", "sell", "close", "close_long", "close_short" |
| quantity | number | Yes | Number of contracts |
| orderType | string | No | Order type: "market" (default), "limit", "stop" |
| price | number | No | Limit/stop price (required for limit/stop orders) |
| stopLoss | number | No | Stop loss in ticks |
| takeProfit | number | No | Take profit in ticks |
| comment | string | No | Trade comment for logging |

### Action Types

| Action | Description |
|--------|-------------|
| buy | Open long position (or add to existing) |
| sell | Open short position (or add to existing) |
| close | Close all positions for symbol |
| close_long | Close only long positions |
| close_short | Close only short positions |

## Response Format

### Success (200)
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "orderId": "12345",
    "symbol": "MNQ",
    "action": "buy",
    "quantity": 1,
    "status": "filled",
    "filledPrice": 18500.25,
    "timestamp": "2026-02-02T12:00:00Z"
  }
}
```

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "symbol", "message": "Symbol is required" },
    { "field": "quantity", "message": "Quantity must be positive" }
  ]
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": "Invalid webhook secret"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Order placement failed",
  "details": "TopstepX API rejected order: Insufficient buying power"
}
```

## TradingView Alert Setup

### Alert Message (JSON)
```
{
  "secret": "{{your-secret}}",
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "quantity": {{strategy.order.contracts}},
  "orderType": "market",
  "comment": "{{strategy.order.comment}}"
}
```

### Webhook URL
```
https://your-domain.vercel.app/api/webhook
```

## Rate Limiting

- Max 10 requests per second
- Requests exceeding limit receive 429 status

## Examples

### Market Buy
```json
{
  "secret": "abc123",
  "symbol": "MNQ",
  "action": "buy",
  "quantity": 1,
  "orderType": "market"
}
```

### Limit Sell
```json
{
  "secret": "abc123",
  "symbol": "MES",
  "action": "sell",
  "quantity": 2,
  "orderType": "limit",
  "price": 5100.50
}
```

### Close All Positions
```json
{
  "secret": "abc123",
  "symbol": "MNQ",
  "action": "close",
  "quantity": 0
}
```
