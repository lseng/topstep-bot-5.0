# Dashboard Specification

## Overview

A minimalistic single-page web dashboard that displays:
- Real-time webhook signals received from TradingView
- Trade execution stream
- Account metrics (balance, realized P&L, unrealized P&L)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TradingView   │────▶│  Webhook API    │────▶│   TopstepX      │
│     Alerts      │     │                 │     │   Gateway API   │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 ▼                       ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Event Store   │     │   SignalR Hub   │
                        │   (In-Memory)   │     │  (Real-time)    │
                        └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 └───────────┬───────────┘
                                             ▼
                                    ┌─────────────────┐
                                    │    Dashboard    │
                                    │   (SSE Stream)  │
                                    └─────────────────┘
```

## Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TopstepX Trading Bot                              [Connected]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Balance    │  │ Realized P&L │  │Unrealized P&L│           │
│  │  $50,000.00  │  │   +$350.00   │  │   +$125.50   │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Recent Signals                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 14:32:15  BUY  MNQ  1 contract  @ market                   │ │
│  │ 14:28:42  SELL MES  2 contracts @ limit 5100.50            │ │
│  │ 14:15:03  BUY  MNQ  1 contract  @ market                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Trade Executions                                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 14:32:15  FILLED  BUY MNQ  1 @ 18,450.25   P&L: --         │ │
│  │ 14:28:43  FILLED  SELL MES 2 @ 5,100.50    P&L: +$45.00    │ │
│  │ 14:15:04  FILLED  BUY MNQ  1 @ 18,425.00   P&L: --         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Technical Requirements

### 1. Dashboard Page
- **Route**: `/` (root)
- **Technology**: Static HTML + vanilla JavaScript (no framework needed)
- **Styling**: Minimal CSS, dark theme for trading
- **Responsive**: Works on desktop and mobile

### 2. Server-Sent Events (SSE) Endpoint
- **Route**: `/api/events`
- **Purpose**: Stream real-time updates to dashboard
- **Events**:
  - `signal` - New webhook signal received
  - `trade` - Trade execution update
  - `account` - Account metrics update

### 3. Account Metrics Endpoint
- **Route**: `/api/account`
- **Purpose**: Get current account metrics
- **Response**:
```json
{
  "accountId": "123456",
  "accountName": "Express Funded 50K",
  "balance": 50000.00,
  "realizedPnL": 350.00,
  "unrealizedPnL": 125.50,
  "updatedAt": "2026-02-02T14:30:00Z"
}
```

### 4. Signals History Endpoint
- **Route**: `/api/signals`
- **Purpose**: Get recent webhook signals (last 50)
- **Response**:
```json
{
  "signals": [
    {
      "id": "sig_123",
      "timestamp": "2026-02-02T14:32:15Z",
      "symbol": "MNQ",
      "action": "buy",
      "quantity": 1,
      "orderType": "market",
      "status": "executed"
    }
  ]
}
```

### 5. Trades History Endpoint
- **Route**: `/api/trades`
- **Purpose**: Get recent trade executions (last 50)
- **Response**:
```json
{
  "trades": [
    {
      "id": "trade_456",
      "timestamp": "2026-02-02T14:32:15Z",
      "symbol": "MNQ",
      "side": "Buy",
      "quantity": 1,
      "filledPrice": 18450.25,
      "status": "Filled",
      "pnl": null
    }
  ]
}
```

## Data Storage

### In-Memory Event Store
For simplicity, use an in-memory store (signals and trades reset on server restart):

```typescript
interface EventStore {
  signals: Signal[];      // Last 100 signals
  trades: Trade[];        // Last 100 trades
  account: AccountMetrics | null;
}
```

### Event Flow
1. Webhook receives TradingView alert
2. Signal is stored in EventStore
3. SSE broadcasts `signal` event to all connected clients
4. Order is placed on TopstepX
5. Trade execution stored in EventStore
6. SSE broadcasts `trade` event
7. Account metrics updated from TopstepX
8. SSE broadcasts `account` event

## Dashboard Features

### Connection Status
- Show green "Connected" when SSE is active
- Show red "Disconnected" with auto-reconnect
- Reconnect automatically after 3 seconds

### Signals Panel
- Show last 20 signals
- Color code: BUY (green), SELL (red), CLOSE (gray)
- Auto-scroll to newest

### Trades Panel
- Show last 20 trade executions
- Show fill price and P&L when available
- Color code P&L: positive (green), negative (red)

### Account Metrics
- Update in real-time via SSE
- Format numbers with currency symbols
- Color code P&L values

## File Structure

```
public/
└── index.html           # Dashboard page (static)

api/
├── webhook.ts           # TradingView webhook (existing)
├── events.ts            # SSE stream endpoint
├── account.ts           # Account metrics endpoint
├── signals.ts           # Signals history endpoint
└── trades.ts            # Trades history endpoint

src/
└── lib/
    └── event-store.ts   # In-memory event storage
```

## Styling Guidelines

### Color Palette (Dark Theme)
- Background: `#0d1117`
- Card background: `#161b22`
- Border: `#30363d`
- Text primary: `#c9d1d9`
- Text secondary: `#8b949e`
- Green (profit/buy): `#3fb950`
- Red (loss/sell): `#f85149`
- Blue (accent): `#58a6ff`

### Typography
- Font: System UI stack
- Monospace for numbers: `'SF Mono', Consolas, monospace`

### Spacing
- Card padding: 16px
- Gap between cards: 16px
- Border radius: 8px
