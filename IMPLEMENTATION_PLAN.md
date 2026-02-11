# TopstepX Trading Bot - Implementation Plan

> Generated: 2026-02-03
> Version: v0.2.0

## Overview

This document outlines the implementation tasks for the TopstepX Trading Bot with Dashboard. The bot receives TradingView webhook alerts, executes trades on TopstepX, and displays real-time data on a minimalistic dashboard.

## Current State

### Implemented
- [x] Project structure and configuration files
- [x] TypeScript type definitions (`src/types/index.ts`)
- [x] Environment variables configured (`.env.local`)
- [x] Build tooling (ESLint, TypeScript, Vitest)
- [x] Vercel deployment configuration
- [x] Specifications complete

### Not Implemented
- [ ] Webhook endpoint
- [ ] TopstepX API client
- [ ] Order management
- [ ] Dashboard page
- [ ] Real-time event streaming
- [ ] Account metrics display

---

## High Priority Tasks (Critical Path)

### Task 1: Create Logger Utility
- [x] **Status: COMPLETE**

**Priority:** HIGH | **Dependencies:** None

Create a structured JSON logger for consistent logging.

**Files:**
- `src/lib/logger.ts` (create)
- `src/lib/logger.test.ts` (create)

**Requirements:**
- Support log levels: debug, info, warn, error
- Output structured JSON for Vercel logs
- Include timestamp, level, message, and optional data
- Never log sensitive data (secrets, API keys)

---

### Task 2: Create Input Validation Module
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Task 1

Create validation functions for webhook payloads.

**Files:**
- `src/lib/validation.ts` (create)
- `src/lib/validation.test.ts` (create)

**Requirements:**
- Validate required fields: secret, symbol, action, quantity
- Validate field types and values
- Return structured validation errors
- Sanitize input to prevent injection

**Reference:** `specs/webhook-api.md`

---

### Task 3: Create TradingView Alert Parser
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Task 2

Parse TradingView alert payloads into structured trade signals.

**Files:**
- `src/services/tradingview/parser.ts` (create)
- `src/services/tradingview/parser.test.ts` (create)

**Requirements:**
- Parse JSON alert format
- Normalize symbol names (e.g., MNQ1! -> MNQ)
- Default orderType to "market" if not specified
- Handle optional fields gracefully

**Reference:** `specs/webhook-api.md`, `specs/topstepx-integration.md`

---

### Task 4: Create TopstepX Authentication Client
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Task 1

Create the TopstepX API client with authentication and token management.

**Files:**
- `src/services/topstepx/client.ts` (create)
- `src/services/topstepx/client.test.ts` (create)

**Requirements:**
- Authenticate with username + API key
- Store JWT token in memory
- Track token expiration
- Refresh token before expiry
- Use environment variables for credentials

**Reference:** `specs/topstepx-integration.md`

---

### Task 5: Create Order Placement Service
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Task 4

Implement order placement via TopstepX API.

**Files:**
- `src/services/topstepx/orders.ts` (create)
- `src/services/topstepx/orders.test.ts` (create)

**Requirements:**
- Place market orders
- Place limit orders
- Place stop orders
- Map webhook actions to TopstepX order format
- Handle order responses and errors

**Reference:** `specs/topstepx-integration.md`

---

### Task 6: Create Event Store
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** None

Create in-memory storage for signals, trades, and account data.

**Files:**
- `src/lib/event-store.ts` (create)
- `src/lib/event-store.test.ts` (create)

**Requirements:**
- Store last 100 signals
- Store last 100 trades
- Store current account metrics
- Provide methods: addSignal, addTrade, updateAccount
- Support SSE broadcast via event emitter

**Reference:** `specs/dashboard.md`

---

### Task 7: Create Webhook Endpoint
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Tasks 2, 3, 5, 6

Create the main webhook endpoint that receives TradingView alerts.

**Files:**
- `api/webhook.ts` (create)
- `api/webhook.test.ts` (create)

**Requirements:**
- Accept POST requests only
- Validate webhook secret
- Parse and validate alert payload
- Store signal in EventStore
- Route to appropriate trading action
- Return proper HTTP status codes
- Log all operations

**Reference:** `specs/webhook-api.md`

---

### Task 8: Create Dashboard Page
- [x] **Status: COMPLETE (minimal version)**

**Priority:** HIGH | **Dependencies:** None

Create the static HTML dashboard page.

**Files:**
- `public/index.html` (create)

**Requirements:**
- Dark theme trading dashboard
- Account metrics cards (balance, realized P&L, unrealized P&L)
- Signals panel (scrollable list)
- Trades panel (scrollable list)
- Connection status indicator
- SSE client for real-time updates
- Auto-reconnect on disconnect
- Responsive design

**Reference:** `specs/dashboard.md`

---

### Task 9: Create SSE Events Endpoint
- [ ] **Status: NOT STARTED**

**Priority:** HIGH | **Dependencies:** Task 6

Create Server-Sent Events endpoint for real-time streaming.

**Files:**
- `api/events.ts` (create)

**Requirements:**
- Implement SSE protocol
- Stream signal events
- Stream trade events
- Stream account updates
- Handle client disconnection
- Support multiple concurrent clients

**Reference:** `specs/dashboard.md`

---

## Medium Priority Tasks

### Task 10: Create Account Service
- [ ] **Status: NOT STARTED**

**Priority:** MEDIUM | **Dependencies:** Task 4

Implement account information retrieval.

**Files:**
- `src/services/topstepx/account.ts` (create)
- `src/services/topstepx/account.test.ts` (create)

**Requirements:**
- Get account details
- Get account balance
- Select account by name
- Update EventStore with account data

**Reference:** `specs/topstepx-integration.md`

---

### Task 11: Create Account Metrics Endpoint
- [ ] **Status: NOT STARTED**

**Priority:** MEDIUM | **Dependencies:** Tasks 6, 10

Create endpoint to get current account metrics.

**Files:**
- `api/account.ts` (create)

**Requirements:**
- Return current balance, realized P&L, unrealized P&L
- Fetch from TopstepX if EventStore is empty
- Cache results in EventStore

**Reference:** `specs/dashboard.md`

---

### Task 12: Create Signals History Endpoint
- [ ] **Status: NOT STARTED**

**Priority:** MEDIUM | **Dependencies:** Task 6

Create endpoint to get recent webhook signals.

**Files:**
- `api/signals.ts` (create)

**Requirements:**
- Return last 50 signals from EventStore
- Include timestamp, symbol, action, quantity, status

**Reference:** `specs/dashboard.md`

---

### Task 13: Create Trades History Endpoint
- [ ] **Status: NOT STARTED**

**Priority:** MEDIUM | **Dependencies:** Task 6

Create endpoint to get recent trade executions.

**Files:**
- `api/trades.ts` (create)

**Requirements:**
- Return last 50 trades from EventStore
- Include fill price, P&L when available

**Reference:** `specs/dashboard.md`

---

### Task 14: Create Position Management Service
- [ ] **Status: NOT STARTED**

**Priority:** MEDIUM | **Dependencies:** Task 4

Implement position tracking and closing.

**Files:**
- `src/services/topstepx/positions.ts` (create)
- `src/services/topstepx/positions.test.ts` (create)

**Requirements:**
- Get open positions
- Close specific position
- Close all positions for symbol
- Support close_long and close_short actions

**Reference:** `specs/topstepx-integration.md`

---

### Task 15: Create Health Check Endpoint
- [x] **Status: COMPLETE**

**Priority:** MEDIUM | **Dependencies:** None

Create a health check endpoint for monitoring.

**Files:**
- `api/health.ts` (create)

**Requirements:**
- Return 200 OK with status JSON
- Include version and timestamp

---

## Low Priority Tasks

### Task 16: Add SignalR WebSocket Client
- [ ] **Status: NOT STARTED**

**Priority:** LOW | **Dependencies:** Task 4

Implement real-time updates via SignalR WebSocket.

**Files:**
- `src/services/topstepx/websocket.ts` (create)
- `src/services/topstepx/websocket.test.ts` (create)

**Requirements:**
- Connect to User Hub
- Handle order status updates
- Handle position changes
- Update EventStore on events
- Auto-reconnect on disconnect

**Reference:** `specs/topstepx-integration.md`

---

### Task 17: Add Rate Limiting
- [ ] **Status: NOT STARTED**

**Priority:** LOW | **Dependencies:** Task 4

Implement rate limiting to respect API limits.

**Files:**
- `src/lib/rate-limiter.ts` (create)
- `src/lib/rate-limiter.test.ts` (create)

**Requirements:**
- Track request count per minute (60/min limit)
- Queue requests when limit reached
- Handle 429 responses gracefully

**Reference:** `specs/topstepx-integration.md`

---

### Task 18: Add Service Index Exports
- [ ] **Status: NOT STARTED**

**Priority:** LOW | **Dependencies:** Tasks 4, 5, 14

Create index files for clean imports.

**Files:**
- `src/services/topstepx/index.ts` (create)
- `src/services/tradingview/index.ts` (create)
- `src/lib/index.ts` (create)

---

### Task 19: Add Integration Tests
- [ ] **Status: NOT STARTED**

**Priority:** LOW | **Dependencies:** Tasks 7, 9

Create integration tests for the complete flow.

**Files:**
- `src/__tests__/integration/webhook-flow.test.ts` (create)

**Requirements:**
- Mock TopstepX API responses
- Test complete webhook -> order flow
- Test SSE streaming

---

## Task Dependency Graph

```
Independent:
  Task 1 (Logger)
  Task 6 (Event Store)
  Task 8 (Dashboard HTML)
  Task 15 (Health Check)

Task 1 (Logger)
    ├── Task 2 (Validation)
    │       └── Task 3 (Parser)
    │               └── Task 7 (Webhook) ←──────────┐
    └── Task 4 (Auth Client)                        │
            ├── Task 5 (Orders) ────────────────────┘
            ├── Task 10 (Account) → Task 11 (Account API)
            ├── Task 14 (Positions)
            ├── Task 16 (WebSocket)
            └── Task 17 (Rate Limiter)

Task 6 (Event Store)
    ├── Task 7 (Webhook)
    ├── Task 9 (SSE Events)
    ├── Task 11 (Account API)
    ├── Task 12 (Signals API)
    └── Task 13 (Trades API)

Task 18 (Index Exports) - Depends on Tasks 4, 5, 14
Task 19 (Integration Tests) - Depends on Tasks 7, 9
```

---

## Recommended Implementation Order

**Phase 1: Foundation**
1. Task 1 - Logger
2. Task 6 - Event Store
3. Task 8 - Dashboard HTML (can work in parallel)

**Phase 2: Core Services**
4. Task 2 - Validation
5. Task 3 - Parser
6. Task 4 - Auth Client
7. Task 5 - Orders

**Phase 3: Webhook & Streaming**
8. Task 7 - Webhook Endpoint
9. Task 9 - SSE Events Endpoint
10. Task 15 - Health Check

**Phase 4: Dashboard APIs**
11. Task 10 - Account Service
12. Task 11 - Account API
13. Task 12 - Signals API
14. Task 13 - Trades API

**Phase 5: Enhancements**
15. Task 14 - Positions
16. Task 16 - WebSocket (optional)
17. Task 17 - Rate Limiter
18. Task 18 - Index Exports
19. Task 19 - Integration Tests

---

## Completion Tracking

| Task | Description | Status | Date |
|------|-------------|--------|------|
| 1 | Logger | COMPLETE | 2026-02-11 |
| 2 | Validation | NOT STARTED | - |
| 3 | Parser | NOT STARTED | - |
| 4 | Auth Client | NOT STARTED | - |
| 5 | Orders | NOT STARTED | - |
| 6 | Event Store | NOT STARTED | - |
| 7 | Webhook | NOT STARTED | - |
| 8 | Dashboard HTML | COMPLETE | 2026-02-11 |
| 9 | SSE Events | NOT STARTED | - |
| 10 | Account Service | NOT STARTED | - |
| 11 | Account API | NOT STARTED | - |
| 12 | Signals API | NOT STARTED | - |
| 13 | Trades API | NOT STARTED | - |
| 14 | Positions | NOT STARTED | - |
| 15 | Health Check | COMPLETE | 2026-02-11 |
| 16 | WebSocket | NOT STARTED | - |
| 17 | Rate Limiter | NOT STARTED | - |
| 18 | Index Exports | NOT STARTED | - |
| 19 | Integration Tests | NOT STARTED | - |

**Progress: 3/19 tasks complete**

---

## Notes

- All API routes are in `/api` for Vercel serverless functions
- Dashboard is served from `/public/index.html`
- Run `npm run validate` after each task
- Update this tracking table as tasks complete
