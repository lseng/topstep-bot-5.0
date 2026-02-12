# Implementation Plan

**Last Updated:** 2026-02-11
**Status:** PLANNING
**Feature:** Alerts Dashboard with Real-Time Updates and Execution Placeholder (Issue #4)

## Summary

Build a real-time alerts dashboard (React SPA via Vite) with REST API endpoints for alert retrieval, Supabase Realtime for live updates, Supabase Auth for login, and a placeholder for future TopstepX trade execution. The dashboard replaces the static `public/index.html` and is served alongside existing Vercel serverless functions.

## Specifications Analyzed

- [x] `specs/feature-alerts-dashboard-with-real-time-updates-an.md` — Primary spec for Issue #4

## Database Analysis

### Existing Tables

**Supabase (`supabase/migrations/20260212000000_create_alerts_table.sql`):**
- `alerts` — Uses enum types (`trade_action`, `order_type`, `alert_status`), columns: `id`, `created_at`, `symbol`, `action`, `quantity`, `order_type`, `price`, `stop_loss`, `take_profit`, `comment`, `status`, `error_message`, `order_id`, `executed_at`, `raw_payload`
- RLS enabled with service role full access policy
- Indexes: `idx_alerts_created_at`, `idx_alerts_symbol`, `idx_alerts_status`, `idx_alerts_symbol_created`

**Neon Legacy (`migrations/001_create_alerts_table.sql`):**
- `alerts` — Different schema using plain TEXT types, includes OHLCV columns (`open_price`, `high_price`, `low_price`, `close_price`, `bar_volume`), `secret_hash`, `interval`, `alert_time`
- `migrations` — Tracking table for Neon migrations

### Schema Discrepancy (CRITICAL)

Two competing schemas exist:
1. **Supabase schema** — Uses enums, has `raw_payload` (JSONB), `error_message`, `order_id`, `executed_at`. Does NOT have OHLCV columns or `secret_hash`.
2. **Neon schema** — Uses TEXT types, has OHLCV columns (`open_price`, etc.), `secret_hash`, `interval`, `alert_time`. Does NOT have `raw_payload`, `error_message`, `order_id`, `executed_at`.

**Decision:** The spec says to use the Supabase client (`@supabase/supabase-js`). The existing `alert-storage.ts` uses the Neon client (`@neondatabase/serverless`) and inserts OHLCV fields directly. The new API endpoints must read from Supabase. OHLCV data is stored in `raw_payload` (JSONB) in the Supabase schema, so the `GET /api/alerts/[id]` endpoint can extract it from there.

### Schema Changes Required

**New migration (`supabase/migrations/20260212100000_enable_realtime_and_anon_read.sql`):**
1. Add `alerts` table to Supabase Realtime publication
2. Add RLS policy for anon key read-only access

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

CREATE POLICY "Anon can read alerts" ON alerts
  FOR SELECT USING (true);
```

**No new tables needed** — reuses existing `alerts` table.

## Gap Analysis

### What Exists
| Component | Status | Notes |
|-----------|--------|-------|
| `POST /api/webhook` | Implemented | Receives/validates TradingView alerts, stores in DB |
| `GET /api/health` | Implemented | Returns status, version, uptime |
| `alerts` table (Supabase) | Implemented | Full schema with enums, indexes, RLS (service role only) |
| `src/lib/supabase.ts` | Implemented | Server-side Supabase client (service role key) — **currently unused** |
| `src/types/database.ts` | Implemented | Supabase database types (`AlertRow`, `AlertInsert`, `AlertUpdate`) |
| `src/types/index.ts` | Implemented | App types (`ParsedWebhookPayload`, `OHLCVData`, etc.) |
| `public/index.html` | Implemented | Static status page (will be replaced by React SPA build output) |
| `vercel.json` | Implemented | Routes for api/* and public/* static serving |
| Unit tests | Implemented | webhook, validation, parser, logger, db, migration, alert-storage |
| E2E tests | Implemented | webhook pipeline tests |

### What's Missing (Gaps)
| Component | Gap | Priority |
|-----------|-----|----------|
| `GET /api/alerts` | Not implemented | P0 — Required for dashboard |
| `GET /api/alerts/[id]` | Not implemented | P0 — Required for alert detail |
| Supabase Realtime publication | Not enabled | P0 — Required for live updates |
| Anon read RLS policy | Missing | P0 — Required for client-side Supabase access |
| Dashboard React SPA | Not implemented | P0 — Core deliverable |
| Vite build config | Not implemented | P0 — Required to build SPA |
| `dashboard/` directory | Does not exist | P0 — SPA source code |
| shadcn/ui setup | Not implemented | P1 — Component library for dashboard |
| TanStack Table integration | Not implemented | P1 — Data table for alerts |
| TanStack Query integration | Not implemented | P1 — Data fetching/caching |
| Supabase Auth (client-side) | Not implemented | P1 — Dashboard login |
| Supabase client (browser) | Not implemented | P1 — Anon key client for Realtime/Auth |
| `VITE_SUPABASE_URL` env var | Not configured | P1 — Browser Supabase config |
| `VITE_SUPABASE_ANON_KEY` env var | Not configured | P1 — Browser Supabase config |
| API response types | Not implemented | P1 — `AlertsResponse`, `AlertDetailResponse` |
| `vercel.json` route updates | Needed | P1 — Add `/api/alerts` routes |
| Dashboard unit tests | Not implemented | P2 — Component rendering tests |
| API endpoint unit tests | Not implemented | P2 — GET alerts tests |
| E2E tests for new endpoints | Not implemented | P2 — Full pipeline tests |
| `package.json` script updates | Needed | P2 — `dashboard:dev`, `dashboard:build` |

### Architectural Observations

1. **Self-contained API constraint**: Vercel API functions in `api/*.ts` must be self-contained — cannot import from `src/lib/*`. However, the current `api/webhook.ts` DOES import from `src/lib/logger`, `src/lib/validation`, `src/lib/tradingview-parser`, `src/lib/db`, and `src/services/alert-storage`. This works in the current Vercel config because `@vercel/node` can resolve relative imports. The new API endpoints should follow the same pattern.

2. **Dual database clients**: The project has both `@neondatabase/serverless` (used by `alert-storage.ts` via `src/lib/db.ts`) and `@supabase/supabase-js` (in `src/lib/supabase.ts`, currently unused). The spec recommends consolidating to Supabase. The new GET endpoints should use the Supabase client since they read from the Supabase-schema alerts table.

3. **ESLint ignores `*.test.ts`** and the `dashboard/` directory is not in any config yet — will need ESLint/TypeScript config updates for React/JSX.

## Prioritized Tasks

### Phase 1: Foundation — Database & API Endpoints

- [x] **1.1** Create Supabase migration `supabase/migrations/20260212100000_enable_realtime_and_anon_read.sql` — Enable Realtime publication on `alerts` table; add anon read-only RLS policy — Low complexity
- [x] **1.2** Add API response types to `src/types/index.ts` — Add `AlertsQuery`, `AlertsResponse`, `AlertDetailResponse`, `PaginationMeta` interfaces matching the spec — Low complexity
- [x] **1.3** Create `api/alerts.ts` — `GET /api/alerts` endpoint with pagination (`page`, `limit`), filtering (`symbol`, `action`, `status`, `from`, `to`), sorting (`sort`, `order`). Self-contained, uses Supabase client inline (or imports from `src/lib/supabase.ts` following existing `api/webhook.ts` pattern). Returns `AlertsResponse` with `data` and `pagination` — Medium complexity
- [x] **1.4** Create `api/alerts/[id].ts` — `GET /api/alerts/[id]` endpoint. Returns single alert with full details. Extract OHLCV data from `raw_payload` JSONB field. Returns `AlertDetailResponse`. 404 for non-existent alerts — Medium complexity
- [x] **1.5** Update `vercel.json` — Add routes for `/api/alerts` → `api/alerts.ts` and `/api/alerts/(.*)` → `api/alerts/[id].ts` (must be ordered before the catch-all `/(*)` route) — Low complexity

### Phase 2: Dashboard Setup — Vite + React + Tailwind

- [ ] **2.1** Install dashboard dependencies — `react`, `react-dom`, `@tanstack/react-query`, `@tanstack/react-table`, `@supabase/supabase-js` (already installed). Dev: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom` — Low complexity
- [ ] **2.2** Create `dashboard/vite.config.ts` — Vite config with React plugin, output to `public/` directory, base path `/`, proxy `/api/*` to Vercel dev server in dev mode — Low complexity
- [ ] **2.3** Create `dashboard/tsconfig.json` — TypeScript config for React (JSX support, `react-jsx` transform, path aliases to shared types) — Low complexity
- [ ] **2.4** Create `dashboard/tailwind.config.ts` — Tailwind CSS config with dark theme, content paths for `dashboard/src/**/*.tsx` — Low complexity
- [ ] **2.5** Create `dashboard/postcss.config.js` — PostCSS config with Tailwind and autoprefixer plugins — Low complexity
- [ ] **2.6** Create `dashboard/index.html` — HTML entry point for Vite SPA with `<div id="root">` and `<script type="module" src="/src/main.tsx">` — Low complexity
- [ ] **2.7** Create `dashboard/src/main.tsx` — React entry point: render `<App />` into `#root`, wrap with `QueryClientProvider` — Low complexity
- [ ] **2.8** Create `dashboard/src/globals.css` — Tailwind base/components/utilities imports, dark theme CSS custom properties — Low complexity
- [ ] **2.9** Create `dashboard/src/lib/supabase.ts` — Browser-side Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars (anon key, NOT service role) — Low complexity
- [ ] **2.10** Update `package.json` scripts — Add `dashboard:dev` (`vite --config dashboard/vite.config.ts`), `dashboard:build` (`vite build --config dashboard/vite.config.ts`). Update `build` to include dashboard build — Low complexity
- [ ] **2.11** Update `.env.example` — Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` entries — Low complexity
- [ ] **2.12** Initialize shadcn/ui — Run `npx shadcn-ui@latest init` in dashboard context. Add components: `table`, `badge`, `button`, `input`, `select`, `card`, `dropdown-menu` — Medium complexity

### Phase 3: Dashboard Components — Core UI

- [ ] **3.1** Create `dashboard/src/App.tsx` — Root component with auth guard, renders `DashboardLayout` if authenticated or `LoginPage` if not — Medium complexity
- [ ] **3.2** Create `dashboard/src/components/LoginPage.tsx` — Supabase Auth email/password login form. Dark themed, centered layout. Calls `supabase.auth.signInWithPassword()` — Medium complexity
- [ ] **3.3** Create `dashboard/src/components/DashboardLayout.tsx` — Page layout: header with title, connection status indicator (green dot + "Connected" / red dot + "Disconnected"), logout button. Main content area for children — Medium complexity
- [ ] **3.4** Create `dashboard/src/components/KpiCards.tsx` — Four KPI summary cards: Total Alerts (count), Success Rate (% executed), Failed Count, Last Alert (relative time). Uses data from alerts query — Medium complexity
- [ ] **3.5** Create `dashboard/src/components/AlertsFilter.tsx` — Filter bar with: Symbol dropdown, Action dropdown (`buy`/`sell`/`close`/`close_long`/`close_short`), Status dropdown (`received`/`processing`/`executed`/`failed`/`cancelled`), Date range picker, Search input — Medium complexity
- [ ] **3.6** Create `dashboard/src/components/AlertsTable.tsx` — TanStack Table with columns: Time (relative), Symbol, Action (colored badge), Qty, Type, Status (colored badge), Price. Sortable columns, expandable rows — High complexity
- [ ] **3.7** Create `dashboard/src/components/AlertDetailPanel.tsx` — Expanded row content: OHLCV data display (O/H/L/C/V), interval, alert time, comment. Execution placeholder panel with "Coming Soon" messaging, placeholder fields for Order ID, Fill Price, Execution Time, P&L — Medium complexity
- [ ] **3.8** Create `dashboard/src/components/StatusBadge.tsx` — Reusable badge component with colors per status: `received` → blue, `processing` → amber (animated pulse), `executed` → green, `failed` → red, `cancelled` → gray — Low complexity
- [ ] **3.9** Create `dashboard/src/components/ActionBadge.tsx` — Reusable badge component with colors per action: `buy` → green, `sell` → red, `close`/`close_long`/`close_short` → gray — Low complexity
- [ ] **3.10** Create `dashboard/src/components/Pagination.tsx` — Pagination controls: Previous/Next buttons, page numbers, per-page selector (10/25/50/100), "Showing X-Y of Z" text — Medium complexity

### Phase 4: Dashboard Hooks — Data Fetching & Real-Time

- [ ] **4.1** Create `dashboard/src/hooks/useAlerts.ts` — TanStack Query hook wrapping `GET /api/alerts`. Accepts filter/sort/page params. Returns `{ data, isLoading, error, refetch }`. Configures background refetch interval — Medium complexity
- [ ] **4.2** Create `dashboard/src/hooks/useAlertDetail.ts` — TanStack Query hook wrapping `GET /api/alerts/[id]`. Accepts alert ID. Returns full alert detail with OHLCV data — Low complexity
- [ ] **4.3** Create `dashboard/src/hooks/useRealtimeAlerts.ts` — Supabase Realtime subscription hook. Subscribes to `postgres_changes` on `alerts` table (INSERT and UPDATE events). On INSERT: invalidate TanStack Query cache to trigger refetch. On UPDATE: invalidate specific alert query. Manages connection state (connected/disconnected indicator) — High complexity
- [ ] **4.4** Create `dashboard/src/hooks/useAuth.ts` — Supabase Auth hook. Manages auth state via `supabase.auth.onAuthStateChange()`. Returns `{ user, isLoading, signIn, signOut }` — Medium complexity

### Phase 5: Config & Integration Updates

- [x] **5.1** Update `tsconfig.json` — Exclude `dashboard/` from root TypeScript config (it has its own tsconfig). Add to `exclude` array — Low complexity
- [x] **5.2** Update `.eslintrc.cjs` — Add `dashboard` to ignorePatterns (dashboard will have its own ESLint config or be handled separately with React plugin) — Low complexity
- [x] **5.3** Update `vitest.config.ts` — Ensure `dashboard/` is excluded from server-side test includes — Low complexity (already excluded, no change needed)
- [x] **5.4** Update `.ports.env` — Confirm `FRONTEND_PORT=9213` aligns with Vite dev server port in `dashboard/vite.config.ts` — Low complexity (already correct, no change needed)

### Phase 6: Testing

- [x] **6.1** Create `tests/alerts-api.test.ts` — Unit tests for `GET /api/alerts`: correct pagination metadata, filters by symbol/action/status, sorts by column in asc/desc, date range filtering, returns 400 for invalid query params — Medium complexity (21 tests)
- [x] **6.2** Create `tests/alerts-detail-api.test.ts` — Unit tests for `GET /api/alerts/[id]`: returns full alert with OHLCV from raw_payload, returns 404 for non-existent alert, validates UUID format — Medium complexity (8 tests)
- [x] **6.3** Create `tests/e2e/alerts-api.e2e.test.ts` — E2E tests: GET /api/alerts with pagination; GET /api/alerts with symbol/status filter; sorting; error handling — Medium complexity (8 tests)
- [x] **6.4** Create `tests/e2e/alerts-detail.e2e.test.ts` — E2E tests: GET /api/alerts/[id] returns OHLCV in response; 404 for non-existent UUID; invalid ID format — Low complexity (5 tests)
- [x] **6.5** Verify all existing tests still pass — Run `npm run test && npm run test:e2e` — 198 unit + 29 E2E = 227 total, zero regressions — Low complexity

### Phase 7: Polish & Build Verification

- [ ] **7.1** Verify `dashboard:build` produces correct output in `public/` — Ensure `index.html` and assets are generated. The old `public/index.html` is replaced — Low complexity
- [ ] **7.2** Verify `vercel dev` serves both API endpoints and dashboard SPA correctly — Test all routes: `/`, `/api/health`, `/api/webhook`, `/api/alerts`, `/api/alerts/[id]` — Low complexity
- [ ] **7.3** Verify Supabase Realtime connection in browser — Manual test: POST webhook → verify alert appears in dashboard without page refresh — Low complexity
- [ ] **7.4** Verify dark theme consistency — Dashboard colors match existing `public/index.html` aesthetic (background `#0d1117`, text `#c9d1d9`, accent `#58a6ff`) — Low complexity
- [ ] **7.5** Run full `npm run validate` — Confirm all linting, type checking, unit tests, and E2E tests pass with zero errors and zero warnings — Low complexity

## Dependencies

```
Phase 1 (Foundation)
  1.1 (Migration) ─────────────┐
  1.2 (Types) ─────────────────┤
  1.3 (GET /api/alerts) ◄──────┤── depends on 1.2 (types)
  1.4 (GET /api/alerts/[id]) ◄─┤── depends on 1.2 (types)
  1.5 (vercel.json) ◄──────────┘── depends on 1.3, 1.4

Phase 2 (Dashboard Setup) — can start in parallel with Phase 1
  2.1 (Dependencies) ──────────┐
  2.2 (Vite config) ◄──────────┤
  2.3 (tsconfig) ◄─────────────┤
  2.4-2.5 (Tailwind/PostCSS) ◄─┤── depends on 2.1
  2.6 (HTML entry) ◄────────────┤
  2.7 (React entry) ◄──────────┤── depends on 2.6
  2.8 (CSS) ◄──────────────────┤── depends on 2.4
  2.9 (Supabase client) ◄──────┤── depends on 2.1
  2.10 (Scripts) ◄──────────────┤
  2.11 (Env vars) ──────────────┤
  2.12 (shadcn/ui) ◄────────────┘── depends on 2.1, 2.4

Phase 3 (Components) — depends on Phase 2 complete
  3.8-3.9 (Badges) ────────────┐
  3.3 (Layout) ────────────────┤
  3.4 (KPI Cards) ◄────────────┤
  3.5 (Filters) ◄──────────────┤
  3.10 (Pagination) ◄──────────┤
  3.6 (Table) ◄────────────────┤── depends on 3.8, 3.9, 3.10
  3.7 (Detail Panel) ◄─────────┤── depends on 3.8
  3.2 (Login) ◄────────────────┤
  3.1 (App) ◄──────────────────┘── depends on all above

Phase 4 (Hooks) — can start after Phase 2, parallel with Phase 3
  4.1 (useAlerts) ─────────────┐── depends on Phase 1 API
  4.2 (useAlertDetail) ────────┤── depends on Phase 1 API
  4.3 (useRealtimeAlerts) ─────┤── depends on 1.1 (migration), 2.9 (client)
  4.4 (useAuth) ───────────────┘── depends on 2.9 (client)

Phase 5 (Config) — can run at any time
  5.1-5.4 (Config updates) ────── independent

Phase 6 (Testing) — depends on Phase 1 complete
  6.1-6.2 (Unit tests) ◄──────── depends on 1.3, 1.4
  6.3-6.4 (E2E tests) ◄───────── depends on 1.3, 1.4
  6.5 (Regression) ◄──────────── depends on all above

Phase 7 (Polish) — depends on all phases complete
  7.1-7.5 ◄────────────────────── depends on Phases 1-6
```

## Notes

### Schema Reconciliation Strategy
The Supabase schema (`supabase/migrations/`) uses `raw_payload` JSONB to store the full original webhook body. OHLCV data is embedded within `raw_payload`. The `GET /api/alerts/[id]` endpoint should extract OHLCV fields from `raw_payload` when constructing the response, matching the `AlertDetailResponse` spec:
```typescript
ohlcv?: { open, high, low, close, volume }
```

### `alert-storage.ts` Uses Neon, Not Supabase
The current `saveAlert()` function uses `@neondatabase/serverless` via `src/lib/db.ts`. The webhook endpoint writes alerts through Neon. The new dashboard endpoints will READ alerts via `@supabase/supabase-js`. This is fine if both are pointing at the same underlying PostgreSQL database (Supabase IS PostgreSQL). The spec recommends eventual consolidation to Supabase client only, but that's out of scope for this issue.

### Vercel Self-Contained API Caveat
The AGENTS.md says API functions must be self-contained, but the existing `api/webhook.ts` imports from `src/lib/*` and `src/services/*`. The new `api/alerts.ts` and `api/alerts/[id].ts` should follow the same pattern — import from `src/lib/supabase.ts` for database reads.

### SPA Routing
The `vercel.json` catch-all route `/(.*) → public/$1` will serve the Vite-built SPA for all non-API routes. This enables client-side routing if needed (e.g., `/login` route in React). No additional Vercel config changes are needed for SPA routing.

### Dashboard Does NOT Need React Testing
The spec's unit test requirements focus on API endpoints and Realtime subscription logic. Dashboard component rendering tests (e.g., "renders alert table with correct columns", "status badges render correct colors") are listed but can be addressed with lightweight snapshot or DOM tests using Vitest + `@testing-library/react` if time permits. The primary test focus should be on API endpoints and E2E flows.

### Environment Variable Safety
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are safe to expose in the browser (anon key has RLS restrictions)
- `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in dashboard code
- `WEBHOOK_SECRET` must NEVER appear in dashboard code

---

PLANNING COMPLETE - Ready for build mode
