# TopstepX Trading Bot - Master Plan

## Overview

A webhook-based trading bot that receives signals from TradingView alerts and executes trades on TopstepX via the ProjectX Gateway API. The system is deployed as serverless functions on Vercel.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TradingView   │────▶│  Vercel Edge    │────▶│   TopstepX      │
│     Alerts      │     │    Function     │     │   Gateway API   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │   Logging &     │
                        │   Monitoring    │
                        └─────────────────┘
```

## Key Components

### 1. Webhook Endpoint
- Receives POST requests from TradingView alerts
- Validates webhook secret for security
- Parses and validates alert payload
- Routes to appropriate trading action

### 2. TopstepX Service
- Authenticates with ProjectX Gateway API
- Manages JWT token lifecycle (refresh on expiry)
- Places market and limit orders
- Tracks open positions
- Handles order modifications and cancellations

### 3. TradingView Parser
- Parses alert message into structured trade signal
- Supports multiple alert formats (JSON, key-value, plain text)
- Extracts: symbol, action (buy/sell), quantity, order type, price

### 4. Real-time Updates (Optional)
- SignalR WebSocket connection for live data
- Order status updates
- Position changes
- Account balance updates

## Data Flow

1. TradingView fires alert with trade signal
2. Webhook validates secret and parses payload
3. Signal is validated and normalized
4. TopstepX client authenticates (or uses cached token)
5. Order is placed via Gateway API
6. Response is logged and returned

## Alert Format

TradingView alerts should send JSON in this format:
```json
{
  "secret": "YOUR_WEBHOOK_SECRET",
  "symbol": "MNQ",
  "action": "buy",
  "quantity": 1,
  "orderType": "market",
  "price": null,
  "stopLoss": 50,
  "takeProfit": 100,
  "comment": "Strategy entry signal"
}
```

## TopstepX API Endpoints

### REST API
- Base URL: `https://api.topstepx.com/api`
- Authentication: JWT Bearer token
- Rate Limit: 60 requests/minute

### WebSocket (SignalR)
- User Hub: `https://rtc.topstepx.com/hubs/user`
- Market Hub: `https://rtc.topstepx.com/hubs/market`

## Security Requirements

1. **Webhook Authentication**
   - Secret token validation on every request
   - Reject requests without valid secret

2. **API Key Protection**
   - Store TopstepX credentials in environment variables
   - Never log sensitive data

3. **Input Validation**
   - Validate all incoming alert data
   - Sanitize before processing
   - Reject malformed requests

## Error Handling

1. **Network Errors**: Retry with exponential backoff (max 3 attempts)
2. **Auth Errors**: Refresh token and retry once
3. **Order Rejection**: Log reason, return error to webhook
4. **Rate Limiting**: Queue requests, respect limits

## Monitoring & Logging

- Structured JSON logs for all operations
- Log levels: DEBUG, INFO, WARN, ERROR
- Key events to log:
  - Webhook received
  - Signal parsed
  - Order placed/filled/rejected
  - Errors and retries

## Deployment

- **Platform**: Vercel (serverless)
- **Runtime**: Node.js 20.x
- **Region**: US East (closest to TopstepX servers)
- **Environment**: Separate configs for dev/staging/prod
