# [FEATURE] Alerts Dashboard with Real-Time Updates and Execution Placeholder

**Type:** Feature
**GitHub Issue:** #4
**Labels:** feature, adw-ready

## Overview

## Feature Description

Build a real-time alerts dashboard that displays all incoming TradingView webhook alerts, provides filtering/sorting/search capabilities, and includes a placeholder UI for future TopstepX trade execution. The dashboard will be a React SPA served alongside the existing Vercel serverless API, using Supabase Realtime for live updates as new alerts arrive.

**Current state:** The app receives TradingView webhooks via `POST /api/webhook`, validates them, and stores them in a PostgreSQL `alerts` table. The only UI is a static `public/index.html` status page that pings `/api/health`. There are **zero read endpoints** — no way to view stored alerts. Trade execution on TopstepX is not yet implemented (the webhook returns `orderId: "pending"`).

**This issue delivers:** A fully functional alerts dashboard where users can monitor every alert in real-time, inspect details, filter by symbol/action/status, and see a clear placeholder for where execution will plug in.

## User Story

As a **trader using TradingView alerts with TopstepX**
I want to **see all my incoming alerts in a real-time dashboard with status tracking**
So that **I can monitor my alert pipeline, verify signals are being received correctly, and be ready for automated execution**

## Problem Statement

1. **Zero visibility** — Alerts are stored in the database but there's no way to view them without direct SQL queries
2. **No read API** — The app only has `POST /api/webhook` and `GET /api/health`; no endpoints exist for retrieving alert data
3. **No real-time feedback** — When a TradingView alert fires, there's no live indicator that it was received
4. **No execution visibility** — The `status` field tracks alert state (`received` → `processing` → `executed` → `failed`) but nothing displays this pipeline
5. **Static landing page** — `public/index.html` is a minimal status badge with no interactive functionality

## Solution Overview

### Architecture Decision: Vite + React SPA (not Next.js)

**Why not Next.js?** The existing project uses standalone Vercel serverless functions (`api/*.ts`) with `@vercel/node` and serves static files from `public/` via `@vercel/static`. Next.js would require restructuring the entire project into its `app/` directory convention. A Vite-built React SPA preserves the existing architecture perfectly:

```
Existing (preserved):                    New (added):
├── api/webhook.ts    ← unchanged       ├── dashboard/        ← React SPA source
├── api/health.ts     ← unchanged       │   ├── src/
├── src/lib/          ← unchanged       │   │   ├── components/
├── src/services/     ← unchanged       │   │   ├── hooks/
│                                        │   │   └── App.tsx
│                                        │   └── vite.config.ts
├── api/alerts.ts     ← NEW             ├── public/           ← Vite build output
├── api/alerts/[id].ts ← NEW            │   ├── index.html    ← replaces old static page
```

The `vercel.json` already separates `api/*` routes from `public/*` static serving — no routing changes needed.

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **UI Framework** | React 18 + TypeScript | Industry standard, massive ecosystem |
| **Build Tool** | Vite | Fast builds, outputs to `public/` for Vercel static serving |
| **Components** | shadcn/ui (Tailwind-based) | Tree-shakeable, dark theme matches existing UI, excellent data table support |
| **Data Table** | TanStack Table v8 | Column sorting, filtering, pagination, row expansion — built for this use case |
| **Data Fetching** | TanStack Query (React Query) | Cache management, background refetch, pairs with TanStack Table |
| **Real-Time** | Supabase Realtime (client-side) | Already a dependency (`@supabase/supabase-js`), no Vercel WebSocket limitation |
| **Auth** | Supabase Auth | Already using Supabase, integrates with RLS, single-user admin |

### Real-Time Strategy: Supabase Realtime (not polling, not SSE)

**Why?** Vercel serverless functions do NOT support WebSockets. SSE hits function timeout (25s hobby, 300s pro). Supabase Realtime solves this by connecting the browser directly to Supabase's WebSocket server, bypassing Vercel entirely:

```
Browser (React) ──WebSocket──▶ Supabase Realtime Server
                                        │
                                   PostgreSQL WAL
                                        │
                                  alerts table INSERT/UPDATE
                                        │
api/webhook.ts ──INSERT──▶ Supabase PostgreSQL
```

When the webhook inserts a row, Supabase detects the WAL change and pushes it to all subscribed dashboard clients in ~100ms. Zero Vercel functions involved in the real-time path.

**Requires:** `ALTER PUBLICATION supabase_realtime ADD TABLE alerts;` in a migration.

---

## ADW Configuration

### Command
```
/feature
```

### Agents
- **Plan**: Use `/ralph plan` with unlimited iterations
- **Build**: Use `/ralph build` with unlimited iterations
- **Test**: Use `/test` to run full validation suite

### Database Impact
- [ ] Creates new table(s): None (uses existing `alerts` table)
- [x] Modifies existing table(s): `alerts` — add Supabase Realtime publication, add RLS policies for anon read access
- [ ] No database changes

### Existing Schema to Reuse
- `src/types/database.ts` — `AlertRow`, `AlertInsert`, `AlertUpdate`, `AlertStatus`, `TradeAction`, `OrderType`
- `src/types/index.ts` — `ParsedWebhookPayload`, `OHLCVData`, `TopstepXOrder`, `TopstepXPosition`, `TopstepXAccount`
- `migrations/001_create_alerts_table.sql` — existing `alerts` table with indexes on `symbol`, `created_at DESC`, `status`

### Affected Components
- [x] `api/*` — New `GET /api/alerts` and `GET /api/alerts/[id]` endpoints
- [x] `src/lib/*` — Supabase client (already exists at `src/lib/supabase.ts`, currently unused)
- [ ] `src/services/*` — No changes
- [x] `src/types/*` — Add dashboard API response types
- [x] `supabase/migrations/*` — New migration for Realtime publication + RLS policies
- [x] `public/*` — Replace static HTML with Vite-built React SPA
- [x] `dashboard/*` — New directory for React SPA source code

---

## Technical Requirements

### New API Endpoints

**`GET /api/alerts`** — List alerts with filtering, sorting, and pagination

```typescript
// Query Parameters
interface AlertsQuery {
  page?: number;          // Default: 1
  limit?: number;         // Default: 25, max: 100
  symbol?: string;        // Filter by symbol (exact match)
  action?: TradeAction;   // Filter by action
  status?: AlertStatus;   // Filter by status
  sort?: string;          // Column name (default: created_at)
  order?: 'asc' | 'desc'; // Sort direction (default: desc)
  from?: string;          // ISO date range start
  to?: string;            // ISO date range end
}

// Response
interface AlertsResponse {
  success: true;
  data: AlertRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**`GET /api/alerts/[id]`** — Get single alert with full details

```typescript
// Response
interface AlertDetailResponse {
  success: true;
  data: AlertRow & {
    ohlcv?: {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
    };
  };
}
```

### Database Changes

**Migration: Enable Supabase Realtime + RLS**

```sql
-- Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- Enable RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Server-side: full access via service role key (used by api/webhook.ts)
CREATE POLICY "Service role has full access" ON alerts
  FOR ALL USING (true);

-- Client-side: read-only access via anon key (used by dashboard)
CREATE POLICY "Anon can read alerts" ON alerts
  FOR SELECT USING (true);
```

### Dashboard UI Components

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  TopstepX Bot Dashboard           [Connected ●] [Login] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Total    │ │ Success  │ │ Failed   │ │ Last     │  │
│  │ Alerts   │ │ Rate     │ │ Count    │ │ Alert    │  │
│  │   47     │ │  93.6%   │ │    3     │ │  2m ago  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  [Symbol ▾] [Action ▾] [Status ▾] [Date Range] [Search]│
│  ┌─────┬────────┬────────┬─────┬────────┬───────┬─────┐│
│  │Time │Symbol  │Action  │ Qty │Type    │Status │Price ││
│  ├─────┼────────┼────────┼─────┼────────┼───────┼─────┤│
│  │2m   │ ES     │ ● BUY  │  1  │market  │●recv  │4852 ││
│  │15m  │ NQ     │ ● SELL │  2  │limit   │●exec  │1845 ││
│  │1h   │ MES    │ ● CLOSE│  1  │market  │●fail  │4830 ││
│  └─────┴────────┴────────┴─────┴────────┴───────┴─────┘│
│  Showing 1-25 of 47          [◀ 1 2 ▶]  [25 ▾ per page]│
│                                                         │
│  ┌─ Expanded Row Detail ──────────────────────────────┐ │
│  │ OHLCV: O:4850.25 H:4853.00 L:4849.75 C:4852.50   │ │
│  │ Volume: 12,500  Interval: 5m  Alert Time: 10:30   │ │
│  │ Comment: Technical breakout                         │ │
│  │                                                     │ │
│  │ ┌─ Execution (Coming Soon) ──────────────────────┐ │ │
│  │ │  TopstepX execution will be available in a      │ │ │
│  │ │  future update. This alert was received and     │ │ │
│  │ │  stored successfully.                           │ │ │
│  │ │  Order ID: pending | Status: received           │ │ │
│  │ └────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Status Badge Colors:**
- `received` → blue
- `processing` → amber/yellow (animated pulse)
- `executed` → green
- `failed` → red
- `cancelled` → gray

**Action Badge Colors:**
- `buy` → green
- `sell` → red
- `close` / `close_long` / `close_short` → gray

**Execution Placeholder Panel:**
The expanded row detail includes a locked/grayed-out "Execution" section that shows:
- Current status: `pending` (no execution engine yet)
- Message: "TopstepX execution will be available in a future update"
- Placeholders for: Order ID, Fill Price, Execution Time, P&L
- This placeholder will be replaced when TopstepX integration is built (see TopstepX API reference below)

### TopstepX API Reference (for future execution)

Documented here for context on what the execution placeholder will eventually connect to:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/Auth/loginKey` | POST | JWT authentication with `userName` + `apiKey` |
| `/api/Account/search` | POST | Get account IDs (required for orders) |
| `/api/Contract/available` | POST | Get tradeable contracts with tick size/value |
| `/api/Order/place` | POST | Place order: `accountId`, `contractId`, `type` (1=Limit, 2=Market, 3=StopLimit, 4=Stop), `side` (0=Buy, 1=Sell), `size` |
| `/api/Order/searchOpen` | POST | Query open orders |
| `/api/Position/searchOpen` | POST | Query open positions |
| `wss://rtc.topstepx.com/hubs/user` | SignalR | Real-time order/position updates |
| `wss://rtc.topstepx.com/hubs/market` | SignalR | Real-time market data |

Rate limits: 60 req/min, burst of 10. JWT tokens expire and need refresh.

### Security

**Authentication:** Supabase Auth with email/password for a single admin user.
- Dashboard checks `supabase.auth.getUser()` on load; redirects to `/login` if unauthenticated
- Supabase anon key (safe for browser) used client-side; service role key stays server-side only in `api/*.ts`
- RLS policies restrict anon key to read-only on `alerts` table

**Environment Variables (new):**
- `VITE_SUPABASE_URL` — Public Supabase URL for browser client
- `VITE_SUPABASE_ANON_KEY` — Public anon key for browser client (safe to expose)

**Existing secrets stay server-side only:** `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`

---

## Acceptance Criteria

- [ ] `GET /api/alerts` returns paginated alerts with filtering by symbol, action, status, and date range
- [ ] `GET /api/alerts/[id]` returns full alert details including OHLCV data
- [ ] Dashboard displays alerts in a sortable, filterable data table
- [ ] New alerts appear in the dashboard in real-time via Supabase Realtime (no page refresh)
- [ ] Alert status updates reflect in real-time (status badge changes live)
- [ ] KPI summary cards show: total alerts, success rate, failed count, time since last alert
- [ ] Expanded row shows OHLCV data, interval, alert time, comment
- [ ] Expanded row shows execution placeholder with "Coming Soon" state and future field placeholders
- [ ] Dashboard is protected by Supabase Auth login
- [ ] Dashboard uses dark theme consistent with existing `public/index.html` aesthetic
- [ ] Responsive layout works on desktop (mobile is nice-to-have, not required)
- [ ] All existing tests pass (webhook, validation, parser, storage)
- [ ] E2E tests cover new API endpoints and dashboard rendering
- [ ] `npm run validate` passes with zero errors

## Testing Requirements

### Unit Tests
- [ ] `GET /api/alerts` — returns correct pagination metadata
- [ ] `GET /api/alerts` — filters by symbol, action, status correctly
- [ ] `GET /api/alerts` — sorts by any column in asc/desc order
- [ ] `GET /api/alerts` — date range filtering works correctly
- [ ] `GET /api/alerts` — returns 400 for invalid query params
- [ ] `GET /api/alerts/[id]` — returns full alert with OHLCV data
- [ ] `GET /api/alerts/[id]` — returns 404 for non-existent alert
- [ ] Supabase Realtime subscription connects and receives INSERT events
- [ ] Dashboard renders alert table with correct columns
- [ ] Status badges render correct colors for each status

### E2E Tests
- [ ] POST webhook → verify alert appears in GET /api/alerts response
- [ ] GET /api/alerts with pagination — verify page 1 and page 2 return different results
- [ ] GET /api/alerts with symbol filter — verify only matching alerts returned
- [ ] Full flow: POST webhook → Supabase Realtime → dashboard table updated

## Validation Commands
```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

## Implementation Notes

### Merge Conflicts to Resolve First
The following files currently have git merge conflicts that should be resolved before starting this work:
- `api/webhook.ts` (HEAD vs feature-issue-2 branch)
- `.eslintrc.cjs`
- `vitest.config.ts`
- `tests/webhook.test.ts`

### Dependency Note
`@neondatabase/serverless` is imported in `src/lib/db.ts` but is NOT listed in `package.json`. Either add it or consolidate to use the Supabase client (`src/lib/supabase.ts` exists but is currently unused). Recommendation: use Supabase client consistently for both server and client.

### New Dependencies Required
```bash
# Dashboard build
npm install react react-dom @tanstack/react-query @tanstack/react-table
npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer
npm install -D @types/react @types/react-dom

# shadcn/ui (installed via CLI)
npx shadcn-ui@latest init
npx shadcn-ui@latest add table badge button input select card
```

### Vite Build Integration
Add to `package.json` scripts:
```json
{
  "dashboard:dev": "vite --config dashboard/vite.config.ts",
  "dashboard:build": "vite build --config dashboard/vite.config.ts",
  "build": "npm run dashboard:build && tsc"
}
```

Vite outputs to `public/` so Vercel serves it as static content. The `vercel.json` already handles `/(*)` → `public/$1` routing.

## References
- Related issues: #2 (Enhanced TradingView webhook parsing with OHLCV data support)
- TopstepX API docs: https://gateway.docs.projectx.com/
- Supabase Realtime docs: https://supabase.com/docs/guides/realtime/postgres-changes
- shadcn/ui Data Table: https://ui.shadcn.com/docs/components/data-table
- TanStack Table: https://tanstack.com/table/latest
- Vercel WebSocket limitations: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/4
- Created: 2026-02-12 01:56:29+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #4*
