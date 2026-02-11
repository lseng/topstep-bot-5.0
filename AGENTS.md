# TopstepX Trading Bot - Operational Guide

> This file contains operational learnings for AI agents working on this codebase.
> Keep it brief (~60 lines). Status/progress belongs in IMPLEMENTATION_PLAN.md.

## Project Overview

TypeScript/Node.js webhook server that receives TradingView alerts and executes trades on TopstepX via the ProjectX Gateway API. Deployed to Vercel as serverless functions.

## Build & Validate Commands

```bash
# Development
npm run dev                    # Start local dev server

# Backpressure (run in this order)
npm run lint                   # ESLint with 0-warnings policy
npm run typecheck              # TypeScript check
npm run test                   # Unit tests (Vitest)

# Full validation
npm run validate               # Runs lint + typecheck + test
```

## File Structure Patterns

```
src/
├── api/                       # Vercel API routes (webhook endpoints)
│   └── webhook.ts            # Main TradingView webhook handler
├── services/                  # External service integrations
│   ├── topstepx/             # ProjectX Gateway API client
│   │   ├── client.ts         # Authentication & HTTP client
│   │   ├── orders.ts         # Order placement/management
│   │   ├── positions.ts      # Position tracking
│   │   └── websocket.ts      # SignalR real-time updates
│   └── tradingview/          # TradingView alert parsing
├── lib/                       # Utilities
│   ├── validation.ts         # Alert validation & sanitization
│   └── logger.ts             # Structured logging
├── types/                     # TypeScript definitions
└── __tests__/                 # Unit tests (co-located)
specs/                         # Feature specifications (source of truth)
```

## Code Patterns

- **API Routes**: Vercel edge functions, validate input, return proper HTTP codes
- **Services**: Async/await, proper error handling, typed responses
- **Tests**: Vitest for unit/integration, mock external APIs

## TopstepX API Context

- **Auth**: JWT tokens from `https://api.topstepx.com/api`
- **Real-time**: SignalR WebSocket hubs for quotes, orders, positions
- **Rate Limits**: 60 requests/minute, burst of 10

## Environment Variables

- `TOPSTEPX_USERNAME` - ProjectX account username
- `TOPSTEPX_API_KEY` - ProjectX API key
- `TOPSTEPX_ACCOUNT_NAME` - Trading account name (optional)
- `WEBHOOK_SECRET` - Secret for validating TradingView alerts

## Operational Learnings

1. **Don't assume not implemented** - Always grep/search before writing new code
2. **Validate all webhook input** - Never trust TradingView alert data blindly
3. **Handle partial fills** - Orders may fill partially; track fill status
4. **Rate limiting** - Implement backoff for API failures
5. **Logging** - Structured JSON logs for debugging

## Common Gotchas

1. **JWT Expiry** - Tokens expire; implement refresh logic
2. **SignalR State** - WebSocket needs reconnection handling
3. **Order Rejection** - TopstepX may reject orders; handle gracefully
4. **Time Zones** - TopstepX uses America/Chicago; convert properly

## When to Update This File

- Discovered a non-obvious build step
- Found a pattern that prevents bugs
- Learned something that would save future loops time
