# Implementation Plan

**Last Updated:** 2026-02-12
**Status:** PLANNING

## Summary

Build a complete autonomous trading pipeline for TopstepX that transforms TradingView webhook alerts into VPVR-confirmed limit orders, manages positions with progressive trailing stops, logs trade reasoning via LLM, and provides backtest + CLI + dashboard capabilities. This is a large greenfield feature (~30 new files) building on the existing webhook-to-Supabase pipeline.

## Specifications Analyzed

- [x] specs/autonomous-trading-pipeline-vpvr-based-entry-trail.md - **Primary spec** (GitHub Issue #10)

## Database Analysis

### Existing Tables
- `alerts` — TradingView webhook alerts with status tracking (migration `20260212000000`)
- Realtime enabled on `alerts` with anon read policy (migration `20260212100000`)

### Existing Enums
- `trade_action`: buy, sell, close, close_long, close_short
- `order_type`: market, limit, stop, stop_limit
- `alert_status`: received, processing, executed, failed, cancelled

### Schema Changes Required
1. **New enum `position_state`**: pending_entry, active, tp1_hit, tp2_hit, tp3_hit, closed, cancelled
2. **New enum `position_side`**: long, short
3. **New table `positions`**: Full position lifecycle tracking with VPVR levels, TP/SL prices, state machine, LLM data
4. **New table `trades_log`**: Completed trade records with entry/exit, P&L, VPVR data, LLM reasoning
5. **Realtime publication** for `positions` table

## Gap Analysis

### What Exists
| Component | Status | Location |
|---|---|---|
| Webhook handler | Done | `api/webhook.ts` |
| Alert storage | Done | `src/services/alert-storage.ts` |
| Supabase client | Done | `src/lib/supabase.ts` |
| Input validation | Done | `src/lib/validation.ts` |
| TradingView parser | Done | `src/lib/tradingview-parser.ts` |
| Logger | Done | `src/lib/logger.ts` |
| Database types (alerts) | Done | `src/types/database.ts` |
| App types | Done | `src/types/index.ts` |
| Dashboard (alerts table, filters, KPIs, detail panel) | Done | `dashboard/src/` |
| Realtime alerts hook | Done | `dashboard/src/hooks/useRealtimeAlerts.ts` |
| API: GET /api/alerts | Done | `api/alerts.ts` |
| API: GET /api/alerts/:id | Done | `api/alerts/[id].ts` |
| API: GET /api/health | Done | `api/health.ts` |

### What's Missing (Everything from the spec)
| Component | Status | Notes |
|---|---|---|
| VPVR Calculator service | **NOT FOUND** | Spec claims it exists at `src/services/vpvr/` but directory is empty |
| Confirmation Engine | **NOT FOUND** | Spec claims it exists at `src/services/confirmation/` but directory is empty |
| TopstepX REST client | **NOT FOUND** | Spec claims it exists at `src/services/topstepx/client.ts` but doesn't exist |
| TopstepX SignalR streaming | **NOT FOUND** | Spec claims it exists at `src/services/topstepx/streaming.ts` but doesn't exist |
| Bot core (entry calc, trailing stop, position manager, etc.) | Missing | `src/bot/` directory doesn't exist |
| Backtest engine | Missing | |
| CLI runner | Missing | |
| Positions/trades_log DB tables | Missing | No migrations exist |
| Positions/trades_log DB types | Missing | Only `alerts` types in database.ts |
| API: GET /api/positions | Missing | |
| API: GET /api/trades-log | Missing | |
| Dashboard: PositionsTable | Missing | |
| Dashboard: TradeLogTable | Missing | |
| Dashboard: VPVR panel in AlertDetail | Missing | |
| Dashboard: P&L KPI cards | Missing | KpiCards only shows alert metrics |
| Dashboard: Realtime positions hook | Missing | |
| LLM trade analyzer | Missing | |
| Supabase write queue | Missing | |

### Critical Discovery
The spec's "What Already Exists" section lists VPVR Calculator, Confirmation Engine, and TopstepX client/streaming as existing, but **none of these exist in this worktree**. They must be built from scratch as prerequisites. This significantly increases the scope.

## Prioritized Tasks

### Phase 1: Database Schema + Types (Foundation)

- [x] **1.1** Create migration `supabase/migrations/20260213000000_create_positions_table.sql` — position_state enum, position_side enum, positions table with all columns from spec (alert_id FK, symbol, side, state, entry/exit prices, TP/SL levels, VPVR data JSONB, LLM fields), indexes on symbol/state/created_at, RLS with service role policy — Low complexity
- [x] **1.2** Create migration `supabase/migrations/20260213000001_create_trades_log_table.sql` — trades_log table with position_id/alert_id FKs, entry/exit prices+times, P&L fields, VPVR levels, LLM reasoning, metadata JSONB, indexes, RLS — Low complexity
- [x] **1.3** Create migration `supabase/migrations/20260213000002_enable_realtime_positions.sql` — Add positions to supabase_realtime publication, anon read policy — Low complexity
- [x] **1.4** Update `src/types/database.ts` — Add PositionState, PositionSide enums, positions table types (Row/Insert/Update), trades_log table types (Row/Insert/Update), helper type exports — Medium complexity

### Phase 2: Prerequisite Services (TopstepX API + VPVR)

- [x] **2.1** Create `src/services/topstepx/types.ts` — API response types for auth, orders, positions, historical bars, SignalR hub messages. Reuse existing TopstepX types from `src/types/index.ts` where possible — Medium complexity
- [x] **2.2** Create `src/services/topstepx/client.ts` — REST client class: authenticate (username + API key → token), place order, cancel order, get positions, get accounts, fetch historical bars (OHLCV). Token caching with expiry. Uses fetch API — High complexity
- [x] **2.3** Create `src/services/topstepx/client.test.ts` — Unit tests with mocked fetch: auth flow, token caching, order placement, position fetching, bar fetching, error handling — Medium complexity
- [x] **2.4** Create `src/services/topstepx/streaming.ts` — SignalR client class wrapping @microsoft/signalr: Market Hub (tick streaming for subscribed contracts), User Hub (order fills, position updates). Event emitter pattern. Connection management with auto-reconnect — High complexity
- [x] **2.5** Create `src/services/topstepx/streaming.test.ts` — Unit tests with mocked SignalR: connection lifecycle, tick events, order fill events, reconnection — Medium complexity
- [x] **2.6** Create `src/services/topstepx/index.ts` — Barrel export — Low complexity
- [x] **2.7** Create `src/services/vpvr/types.ts` — VPVRResult (poc, vah, val, valueAreaHigh/Low, profileBars), VPVRConfig (period, valueAreaPercent), HistoricalBar — Low complexity
- [x] **2.8** Create `src/services/vpvr/calculator.ts` — Pure function: takes array of OHLCV bars → computes volume profile → returns POC, VAH, VAL, range high/low. Port from Fr3d0's Pine Script logic. No I/O — High complexity
- [x] **2.9** Create `src/services/vpvr/calculator.test.ts` — Unit tests: known bar data → expected VPVR levels, edge cases (single bar, equal volumes, empty data) — Medium complexity
- [x] **2.10** Create `src/services/vpvr/index.ts` — Barrel export — Low complexity
- [x] **2.11** Create `src/services/confirmation/types.ts` — ConfirmationResult (score 0-100, breakdown per timeframe), ConfirmationConfig — Low complexity
- [x] **2.12** Create `src/services/confirmation/engine.ts` — Dual-timeframe (1M+5M) VPVR confirmation scoring. Takes 1M and 5M VPVR results → produces confirmation score. Pure function — Medium complexity
- [x] **2.13** Create `src/services/confirmation/engine.test.ts` — Unit tests: aligned levels score high, divergent levels score low, edge cases — Medium complexity
- [x] **2.14** Create `src/services/confirmation/index.ts` — Barrel export — Low complexity

### Phase 3: Bot Core — Pure Business Logic (no I/O)

- [x] **3.1** Create `src/bot/types.ts` — ManagedPosition (in-memory state), BotConfig (account ID, contract ID, dry-run flag), PositionEvent enum, TrailingStopResult, EntryCalcResult — Medium complexity
- [x] **3.2** Create `src/bot/entry-calculator.ts` — Pure function: given VPVRResult + trade action (buy/sell) → compute target entry price (VAL for buy, VAH for sell), initial SL (below VAL for buy, above VAH for sell), TP1/TP2/TP3 prices — Medium complexity
- [x] **3.3** Create `src/bot/entry-calculator.test.ts` — Unit tests: buy entries at VAL, sell entries at VAH, SL placement, TP level calculations, edge cases — Medium complexity
- [x] **3.4** Create `src/bot/trailing-stop.ts` — Pure function: given current position state + current price → determine if TP level hit, compute new SL level. TP1→SL=entry, TP2→SL=TP1, TP3→SL=TP2. Check SL breach. Returns new state + new SL — Medium complexity
- [x] **3.5** Create `src/bot/trailing-stop.test.ts` — Unit tests: TP1/TP2/TP3 progression for longs+shorts, SL breach detection, no-change scenarios, state transitions — Medium complexity

### Phase 4: Bot Core — State Machine

- [x] **4.1** Create `src/bot/position-manager.ts` — PositionManager class: manages in-memory ManagedPosition map. Methods: openPosition (alert → VPVR → entry calc → pending_entry), onFill (pending_entry → active), onTick (check trailing stops, SL breach), onOpposingAlert (cancel or close), onClose. Event emitter for state changes — High complexity
- [x] **4.2** Create `src/bot/position-manager.test.ts` — Unit tests: full lifecycle (open → fill → TP progression → close), opposing alert cancellation, SL breach closure, multiple concurrent positions, state machine transitions (~30 tests) — High complexity

### Phase 5: Bot Core — I/O Services

- [x] **5.1** Create `src/bot/trade-executor.ts` — TradeExecutor class: wraps TopstepX client. Methods: placeLimitOrder, cancelOrder, closePosition (market order). Maps ManagedPosition to TopstepX order format. Error handling with retries — Medium complexity
- [x] **5.2** Create `src/bot/trade-executor.test.ts` — Unit tests with mocked TopstepX client: order placement, cancellation, close, error scenarios — Medium complexity
- [x] **5.3** Create `src/bot/supabase-writer.ts` — SupabaseWriteQueue class: 5-second flush interval, dirty flag pattern. Methods: markDirty(positionId), flush() batches all dirty positions into upsert. On position close, write to trades_log. Prevents Supabase rate limit abuse — Medium complexity
- [x] **5.4** Create `src/bot/supabase-writer.test.ts` — Unit tests: dirty flag marking, batch flush, debounce behavior, trades_log write on close, timer cleanup — Medium complexity
- [x] **5.5** Create `src/bot/alert-listener.ts` — AlertListener class: Supabase Realtime subscription on `alerts` table (INSERT events with status='received'). Emits new alerts to callback. Handles connection lifecycle — Medium complexity
- [x] **5.6** Create `src/bot/alert-listener.test.ts` — Unit tests with mocked Supabase Realtime: subscription setup, event parsing, reconnection — Medium complexity
- [x] **5.7** Create `src/bot/llm-analyzer.ts` — LLMAnalyzer class: invokes Claude Code CLI programmatically via child process. Passes VPVR levels, price action, alert details, confirmation score as context. Returns reasoning + confidence. 10-second timeout, fire-and-forget (never blocks execution) — Medium complexity
- [x] **5.8** Create `src/bot/llm-analyzer.test.ts` — Unit tests with mocked child process: successful analysis, timeout handling, error handling, never-blocking behavior — Medium complexity

### Phase 6: Bot Runner + CLI

- [x] **6.1** Create `src/bot/runner.ts` — BotRunner class: main orchestrator. Wires together: AlertListener → PositionManager → TradeExecutor → SupabaseWriteQueue. On new alert: fetch 5M bars → compute VPVR → confirm → calculate entry → place order. On SignalR tick: feed to PositionManager for trailing stop checks. On fill: transition to active. Lifecycle: start() / stop() with graceful shutdown — High complexity
- [x] **6.2** Create `src/bot/runner.test.ts` — Unit tests: lifecycle (start/stop), alert-to-order flow, tick processing, graceful shutdown — Medium complexity
- [x] **6.3** Create `src/bot/cli.ts` — CLI entry point (`npm run bot`). Parses args (--dry-run, --account-id, --contract-id). Instantiates BotRunner. Shows live terminal status: positions, P&L, pending orders, last alert. Ctrl+C graceful shutdown. Uses process.stdout for status line — Medium complexity
- [x] **6.4** Create `src/bot/index.ts` — Barrel export for all bot modules — Low complexity
- [x] **6.5** Update `package.json` — Add `"bot": "vite-node src/bot/cli.ts"` script — Low complexity

### Phase 7: Backtest Engine

- [x] **7.1** Create `src/bot/backtest/types.ts` — BacktestConfig, SimulatedTrade (entry/exit/P&L/TP hit), BacktestResult (win rate, avg P&L, profit factor, Sharpe ratio, per-trade breakdown) — Low complexity
- [x] **7.2** Create `src/bot/backtest/simulator.ts` — Pure function: given an alert + historical bars → simulate VPVR entry, TP progression, trailing SL, close. Returns SimulatedTrade. No I/O — Medium complexity
- [x] **7.3** Create `src/bot/backtest/simulator.test.ts` — Unit tests: winning trade, losing trade, TP1/TP2/TP3 scenarios, entry never hit, opposing alert — Medium complexity
- [x] **7.4** Create `src/bot/backtest/engine.ts` — BacktestEngine class: fetch all alerts from Supabase, for each fetch historical bars from TopstepX, run simulator, aggregate results. Computes win rate, avg P&L, profit factor, Sharpe — Medium complexity
- [x] **7.5** Create `src/bot/backtest/engine.test.ts` — Unit tests with mocked Supabase + TopstepX: aggregation logic, edge cases (no alerts, no bars) — Medium complexity
- [x] **7.6** Create `src/bot/backtest/reporter.ts` — Format BacktestResult for terminal output (table of trades, summary stats) — Low complexity
- [x] **7.7** Create `src/bot/backtest/cli.ts` — Entry point for `npm run backtest`. Parse args (--symbol, --from, --to). Run engine, print report — Low complexity
- [x] **7.8** Create `src/bot/backtest/index.ts` — Barrel export — Low complexity
- [x] **7.9** Update `package.json` — Add `"backtest": "vite-node src/bot/backtest/cli.ts"` script — Low complexity

### Phase 8: API Endpoints

- [x] **8.1** Create `api/positions.ts` — GET /api/positions: paginated, filterable by symbol/state/side, sorted by created_at desc. Self-contained Vercel function (inline Supabase client). Return positions with pagination metadata — Medium complexity
- [x] **8.2** Create `api/trades-log.ts` — GET /api/trades-log: paginated, filterable by symbol/side, sorted by exit_time desc. Self-contained. Return completed trades with pagination — Medium complexity
- [x] **8.3** Update `vercel.json` — Add rewrites for `/api/positions` and `/api/trades-log` (if needed for path params, otherwise auto-routed) — Low complexity (No changes needed: auto-routed)

### Phase 9: Dashboard Updates

- [ ] **9.1** Create `dashboard/src/hooks/usePositions.ts` — React Query hook: fetch GET /api/positions with filters, polling — Low complexity
- [ ] **9.2** Create `dashboard/src/hooks/useTradeLog.ts` — React Query hook: fetch GET /api/trades-log with filters — Low complexity
- [ ] **9.3** Create `dashboard/src/hooks/useRealtimePositions.ts` — Supabase Realtime subscription on `positions` table. Invalidate React Query cache on INSERT/UPDATE — Medium complexity
- [ ] **9.4** Create `dashboard/src/components/PositionsTable.tsx` — Table showing active positions: symbol, side, state, entry price, current price, unrealized P&L, current SL, TP levels. Color-coded P&L. Uses @tanstack/react-table — Medium complexity
- [ ] **9.5** Create `dashboard/src/components/TradeLogTable.tsx` — Table showing completed trades: symbol, side, entry/exit prices+times, net P&L, TP hit, exit reason. Sortable, filterable — Medium complexity
- [ ] **9.6** Update `dashboard/src/components/KpiCards.tsx` — Add two new KPI cards: Total P&L (sum of trades_log net_pnl) and Active Positions count — Medium complexity
- [ ] **9.7** Update `dashboard/src/components/AlertDetailPanel.tsx` — Add VPVR section showing POC, VAH, VAL, confirmation score (from position's vpvr_data if linked) — Medium complexity
- [ ] **9.8** Update `dashboard/src/App.tsx` — Add tab navigation for Alerts / Positions / Trade Log views. Wire up new hooks and components — Medium complexity

### Phase 10: Testing

- [ ] **10.1** Create `tests/e2e/positions-api.e2e.test.ts` — E2E test: GET /api/positions returns 200 with pagination, filters work, empty state returns empty array — Medium complexity
- [ ] **10.2** Create `tests/e2e/trades-log-api.e2e.test.ts` — E2E test: GET /api/trades-log returns 200 with pagination, filters work — Medium complexity
- [ ] **10.3** Create `tests/e2e/bot-dry-run.e2e.test.ts` — E2E test: bot runner starts in dry-run mode, processes a simulated alert, does not place real orders — Medium complexity
- [ ] **10.4** Create `tests/e2e/backtest.e2e.test.ts` — E2E test: backtest engine runs against mocked data, produces valid results — Medium complexity
- [ ] **10.5** Run `npm run validate` — Ensure all lint, typecheck, unit tests, and e2e tests pass with 0 warnings — Low complexity

## Dependencies

```
Phase 1 (DB Schema + Types)
  └── Phase 2 (Prerequisite Services)
        ├── 2.1-2.6 (TopstepX) ── independent
        ├── 2.7-2.10 (VPVR) ── independent
        └── 2.11-2.14 (Confirmation) ── depends on VPVR types
              └── Phase 3 (Pure Business Logic)
                    ├── 3.1-3.3 (Entry Calculator) ── depends on VPVR types
                    └── 3.4-3.5 (Trailing Stop) ── independent
                          └── Phase 4 (State Machine)
                                └── Phase 5 (I/O Services) ── depends on TopstepX + State Machine
                                      └── Phase 6 (Runner + CLI)
                                            └── Phase 7 (Backtest) ── can parallel with Phase 6

Phase 1 (DB Types) → Phase 8 (API Endpoints) ── can start after Phase 1
Phase 8 (API) → Phase 9 (Dashboard) ── depends on API endpoints
Phase 1-9 → Phase 10 (Testing) ── final validation
```

## Notes

1. **Missing prerequisites are critical**: The spec assumes VPVR, Confirmation Engine, and TopstepX client already exist. They do not. Phase 2 must be built from scratch, which adds significant scope.

2. **API functions must be self-contained**: Per AGENTS.md, Vercel API functions in `api/*.ts` cannot import from `src/lib/*`. The positions and trades-log endpoints must inline their Supabase client initialization.

3. **ESLint ignores dashboard and test files**: The `.eslintrc.cjs` ignores `dashboard/**` and `*.test.ts`, so dashboard code and tests won't be linted. The `--max-warnings 0` policy applies to `src/` and `api/` code.

4. **SignalR dependency already installed**: `@microsoft/signalr` is in package.json dependencies, ready for the streaming client.

5. **Bot runs locally, not on Vercel**: The CLI bot needs persistent SignalR connections and cannot run as serverless functions. It uses `vite-node` for local execution.

6. **Supabase is the primary database**: The codebase uses both Neon (`src/lib/db.ts`) and Supabase (`src/lib/supabase.ts`), but the active data flow uses Supabase exclusively. New features should use Supabase.

7. **Dashboard uses path aliases**: `@dashboard/` is mapped in the Vite config for dashboard imports.

8. **Existing API functions DO import from src/**: Despite AGENTS.md saying they shouldn't, `api/webhook.ts` and `api/alerts.ts` import from `../src/lib/` and `../src/services/`. New API functions should follow the existing pattern for consistency (the imports work in practice).

---

PLANNING COMPLETE - Ready for build mode
