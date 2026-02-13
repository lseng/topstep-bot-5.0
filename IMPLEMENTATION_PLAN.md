# Implementation Plan

**Last Updated:** 2026-02-12
**Status:** PLANNING
**Spec:** `specs/autonomous-trading-pipeline-vpvr-based-entry-trail.md` (GitHub Issue #10)

## Summary

Build a complete autonomous trading pipeline on top of the existing webhook→VPVR confirmation system. The bot uses VPVR analysis to find optimal entry prices (limit orders at VAL/VAH), manages positions with progressive trailing stops (TP1→BE, TP2→TP1, TP3→TP2), supports backtesting against historical alerts, runs as a local CLI process with SignalR streaming, and logs trade reasoning via LLM. Includes new database tables (`positions`, `trades_log`), API endpoints, and dashboard views.

## Specifications Analyzed
- [x] `specs/autonomous-trading-pipeline-vpvr-based-entry-trail.md` — **Primary spec for this plan**

## Database Analysis

### Existing Tables
| Table | Migration | Status |
|-------|-----------|--------|
| `alerts` | `20260212000000_create_alerts_table.sql` | Complete — enums `trade_action`, `order_type`, `alert_status`; RLS enabled |
| (realtime) | `20260212100000_enable_realtime_and_anon_read.sql` | Complete — alerts in Realtime publication, anon read policy |

### Existing Types (`src/types/database.ts`)
- `TradeAction`, `OrderType`, `AlertStatus` enums
- `AlertRow`, `AlertInsert`, `AlertUpdate` interfaces

### Schema Changes Required
1. **New enum `position_state`**: `pending_entry`, `active`, `tp1_hit`, `tp2_hit`, `tp3_hit`, `closed`, `cancelled`
2. **New enum `position_side`**: `long`, `short`
3. **New table `positions`**: 22 columns — tracks live position state, VPVR levels, TP/SL prices, P&L, LLM data
4. **New table `trades_log`**: 18 columns — immutable record of completed trades with full entry/exit data
5. **Realtime**: Add `positions` to Supabase Realtime publication, anon read policy
6. **Indexes**: positions(symbol, state), positions(alert_id), trades_log(position_id), trades_log(symbol, created_at)

## Gap Analysis

### What Exists (reuse, don't duplicate)
| Component | Location | Notes |
|-----------|----------|-------|
| VPVR Calculator | `src/services/vpvr/calculator.ts` | Pure function, `calculateVpvr(bars)` → `VpvrResult` with POC/VAH/VAL |
| Confirmation Engine | `src/services/confirmation/engine.ts` | `confirmAlert()` fetches bars, runs dual-timeframe VPVR, scores |
| TopstepX REST Client | `src/services/topstepx/client.ts` | `placeOrder()`, `cancelOrder()`, `closePosition()`, `getPositions()`, `getHistoricalBars()` |
| TopstepX Streaming | `src/services/topstepx/streaming.ts` | `UserHubConnection` (orders/positions), `MarketHubConnection` (quotes/trades) |
| TopstepX Types | `src/services/topstepx/types.ts` | `PlaceOrderParams`, `OrderSide`, `OrderTypeNum`, `GatewayQuoteEvent`, `CONTRACT_SPECS`, etc. |
| Alert Storage | `src/services/alert-storage/alert-storage.ts` | Saves alerts to Supabase |
| Supabase Client | `src/lib/supabase.ts` | Initialized with service role key |
| Logger | `src/lib/logger.ts` | Structured JSON logging with redaction |
| Contract Resolver | `src/services/topstepx/client.ts:getCurrentContractId()` | Quarterly futures contract ID |

### What's Missing (everything below must be built)
- **Entire `src/bot/` directory** — zero files exist
- **Database migrations** for `positions` and `trades_log`
- **Database types** for new tables
- **API endpoints**: `/api/positions`, `/api/trades-log`
- **Dashboard components**: PositionsTable, TradeLogTable, VPVR panel on alert detail
- **Dashboard hooks**: usePositions, useTradeLog, useRealtimePositions
- **KPI cards**: P&L and position count metrics
- **npm scripts**: `bot`, `backtest`
- **Backtest engine** with simulator and reporter

## Prioritized Tasks

### Phase 1: Types + Database Schema (Foundation)

- [x] **1.1** Create `src/bot/types.ts` — Define `PositionState` (enum matching DB), `PositionSide`, `ManagedPosition` (in-memory position with VPVR levels, TP/SL prices, dirty flag), `BotConfig` (account ID, contract ID, dry-run flag, SL buffer, write interval), `TradeResult` (for logging completed trades), `TickData` (price + timestamp from SignalR quote events)
- [x] **1.2** Create `src/bot/backtest/types.ts` — Define `BacktestConfig` (date range, symbol, simulation params), `SimulatedTrade` (entry/exit/TP progression/P&L), `BacktestResult` (win rate, avg P&L, profit factor, Sharpe ratio, max drawdown, per-trade breakdown)
- [x] **1.3** Create migration `supabase/migrations/20260213000000_create_positions_table.sql` — Enum types `position_state` + `position_side`, `positions` table (22 columns per spec), indexes on `(symbol, state)`, `(alert_id)`, RLS + service role full access policy, table comment
- [x] **1.4** Create migration `supabase/migrations/20260213000001_create_trades_log_table.sql` — `trades_log` table (18 columns per spec), indexes on `(position_id)`, `(symbol, created_at DESC)`, RLS + service role full access policy, table comment
- [x] **1.5** Create migration `supabase/migrations/20260213000002_enable_realtime_positions.sql` — Add `positions` to Realtime publication, anon read policy for both `positions` and `trades_log`
- [x] **1.6** Update `src/types/database.ts` — Add `PositionState`, `PositionSide` type unions, `PositionRow`/`PositionInsert`/`PositionUpdate` interfaces, `TradesLogRow`/`TradesLogInsert` interfaces matching the migration schemas; update `Database` interface with new tables
- [x] **1.7** Create `src/bot/index.ts` — Barrel export for all bot modules

### Phase 2: Pure Business Logic (no I/O, full test coverage)

- [x] **2.1** Create `src/bot/entry-calculator.ts` — Pure function `calculateEntryPrice(action: TradeAction, vpvr: VpvrResult, config?: { slBufferTicks?: number }): { entryPrice: number; initialSl: number; tp1: number; tp2: number; tp3: number }`. BUY: entry=VAL, SL=below VAL, TP1=POC, TP2=VAH, TP3=rangeHigh. SELL: entry=VAH, SL=above VAH, TP1=POC, TP2=VAL, TP3=rangeLow. Uses `CONTRACT_SPECS` tick sizes for SL buffer.
- [x] **2.2** Create `src/bot/entry-calculator.test.ts` — ~15 tests: BUY entry at VAL with correct TP/SL levels, SELL entry at VAH with correct levels, SL buffer tick calculation, edge cases (flat range, narrow value area), close actions return null
- [x] **2.3** Create `src/bot/trailing-stop.ts` — Pure function `evaluateTrailingStop(position: ManagedPosition, currentPrice: number): { newState?: PositionState; newSl?: number; shouldClose?: boolean; closeReason?: string }`. Implements TP progression: TP1→SL=entry, TP2→SL=TP1, TP3→SL=TP2. Checks SL breach (long: price <= currentSl, short: price >= currentSl). Returns state transitions and new SL values.
- [x] **2.4** Create `src/bot/trailing-stop.test.ts` — ~15 tests: Long position TP1 hit moves SL to entry, TP2 hit moves SL to TP1, TP3 hit moves SL to TP2, SL breach from each state triggers close, short position mirror logic, no state change when price is between levels, opposing alert causes close
- [x] **2.5** Create `src/bot/backtest/simulator.ts` — Pure function `simulateTrade(alert: AlertRow, bars: Bar[], vpvrResult: VpvrResult): SimulatedTrade | null`. Takes stored alert + historical bars, simulates entry at VPVR level, walks forward through bars checking TP/SL progression using `evaluateTrailingStop()`, returns full trade lifecycle. No I/O.
- [x] **2.6** Create `src/bot/backtest/simulator.test.ts` — ~10 tests: Simulates long entry fill at VAL, short entry fill at VAH, TP1/TP2/TP3 progression, SL hit scenarios, entry never fills (cancelled), P&L calculation accuracy

### Phase 3: Position Manager (State Machine)

- [x] **3.1** Create `src/bot/position-manager.ts` — `PositionManager` class: manages Map of active `ManagedPosition` objects keyed by symbol. Methods: `onAlert(alert)` → creates pending_entry or cancels existing; `onOrderFill(orderId, fillPrice)` → transitions to active; `onTick(symbol, price, timestamp)` → evaluates trailing stop, emits close commands; `onClose(symbol, exitPrice, reason)` → transitions to closed. Emits typed events: `placeOrder`, `cancelOrder`, `closePosition`, `stateChange`, `positionClosed`. Uses `entry-calculator.ts` and `trailing-stop.ts` internally.
- [x] **3.2** Create `src/bot/position-manager.test.ts` — ~30 tests: Full state machine coverage — alert creates pending_entry, fill transitions to active, TP1/TP2/TP3 progression on tick, SL breach closes, opposing alert cancels pending or closes active, duplicate alert on same symbol replaces, close alert closes active position, error states (fill for unknown order, tick for unknown symbol), event emission verification

### Phase 4: I/O Services (mocked tests)

- [x] **4.1** Create `src/bot/trade-executor.ts` — `TradeExecutor` class: wraps TopstepX client. Methods: `placeLimitEntry(symbol, side, price, quantity, accountId)` → calls `placeOrder()` with `OrderTypeNum.LIMIT`; `cancelEntry(orderId, accountId)` → calls `cancelOrder()`; `marketClose(symbol, side, quantity, accountId)` → calls `closePosition()`. Handles contract resolution via `getCurrentContractId()`. Dry-run mode logs but doesn't call API.
- [x] **4.2** Create `src/bot/trade-executor.test.ts` — ~10 tests: Limit order placement with correct params, cancel order, market close, dry-run mode skips API calls, error handling for failed orders
- [x] **4.3** Create `src/bot/supabase-writer.ts` — `SupabaseWriteQueue` class: 5-second interval flush timer, dirty flag per position. Methods: `markDirty(positionId, data)` → buffers update; `flush()` → batch upserts all dirty positions to Supabase, inserts completed trades to `trades_log`; `writeTradeLog(trade)` → immediate insert for completed trades; `start()`/`stop()` → manage interval timer. Only writes on state changes, not every tick.
- [x] **4.4** Create `src/bot/supabase-writer.test.ts` — ~10 tests: Dirty flag pattern, 5-second flush batching, only writes changed positions, trade log insert on close, start/stop lifecycle, error handling on write failure
- [x] **4.5** Create `src/bot/alert-listener.ts` — `AlertListener` class: subscribes to Supabase Realtime `alerts` table INSERT events. Filters for `status='received'` and `action in ('buy','sell','close','close_long','close_short')`. Emits `newAlert` event with parsed `AlertRow`. Methods: `start(supabaseClient)` → subscribes; `stop()` → unsubscribes.
- [x] **4.6** Create `src/bot/alert-listener.test.ts` — ~5 tests: Subscription setup, event filtering (ignores non-received alerts), event emission with correct data, unsubscribe on stop, reconnection handling
- [x] **4.7** Create `src/bot/llm-analyzer.ts` — `analyzeTrade(context: { symbol, action, vpvrLevels, confirmationScore, price }): Promise<{ reasoning: string; confidence: number } | null>`. Invokes Claude Code CLI via `child_process.exec()` with 10-second timeout. Fire-and-forget — never blocks trade execution. Returns null on timeout/error. Formats context as a structured prompt.
- [x] **4.8** Create `src/bot/llm-analyzer.test.ts` — ~5 tests: Successful analysis returns reasoning + confidence, timeout returns null, CLI error returns null, context formatting, never blocks (measures execution time)

### Phase 5: Bot Runner + CLI

- [x] **5.1** Create `src/bot/runner.ts` — `BotRunner` class: main orchestrator. Constructor takes `BotConfig`. `start()`: authenticates TopstepX, connects User Hub + Market Hub, starts alert listener, starts write queue, subscribes to market data for configured symbols. Wires: alert listener → position manager → trade executor + write queue. Market Hub ticks → position manager.onTick(). User Hub order events → position manager.onOrderFill(). Position manager close events → trade executor.marketClose() + write queue.writeTradeLog(). LLM analyzer called fire-and-forget on new entries. `stop()`: graceful shutdown — close pending orders, disconnect hubs, flush write queue, unsubscribe alerts.
- [x] **5.2** Create `src/bot/runner.test.ts` — ~15 tests: Start/stop lifecycle, alert → entry order flow, fill → active position flow, tick → trailing stop flow, SL breach → close flow, opposing alert → cancel/close flow, graceful shutdown flushes state, dry-run mode, error recovery (hub reconnect, write failure)
- [x] **5.3** Create `src/bot/cli.ts` — Entry point for `npm run bot`. Parses CLI args (`--dry-run`, `--symbol`, `--account-id`). Loads env vars from `.env.local`. Creates and starts `BotRunner`. Renders live terminal status every second: active positions, P&L, pending orders, last alert, connection status. Handles Ctrl+C for graceful shutdown (SIGINT/SIGTERM). Uses `process.stdout.write` with ANSI escape codes for in-place updates.
- [x] **5.4** Update `package.json` — Add `"bot": "vite-node src/bot/cli.ts --"` and `"backtest": "vite-node src/bot/backtest/cli.ts --"` scripts

### Phase 6: Backtest Engine

- [ ] **6.1** Create `src/bot/backtest/engine.ts` — `runBacktest(config: BacktestConfig): Promise<BacktestResult>`. Fetches alerts from Supabase (filtered by date range, symbol). For each alert, fetches historical 5M bars at that timestamp via `getHistoricalBars()`, runs `calculateVpvr()`, then `simulateTrade()`. Aggregates results: win rate, total/avg P&L, profit factor (gross wins / gross losses), Sharpe ratio, max drawdown, per-trade breakdown.
- [ ] **6.2** Create `src/bot/backtest/engine.test.ts` — ~15 tests: Fetches correct alerts, handles empty alerts, simulation aggregation math, win rate calculation, profit factor, Sharpe ratio, max drawdown tracking, date range filtering
- [ ] **6.3** Create `src/bot/backtest/reporter.ts` — `formatBacktestReport(result: BacktestResult): string`. Formats results for terminal output: summary stats table, per-trade breakdown, P&L curve (ASCII), win/loss distribution. Uses ANSI colors for profit (green) / loss (red).
- [ ] **6.4** Create `src/bot/backtest/cli.ts` — Entry point for `npm run backtest`. Parses CLI args (`--symbol`, `--from`, `--to`, `--verbose`). Loads env vars. Runs `runBacktest()`, prints report via `formatBacktestReport()`.
- [ ] **6.5** Create `src/bot/backtest/index.ts` — Barrel export

### Phase 7: API Endpoints

- [ ] **7.1** Create `api/positions.ts` — `GET /api/positions` — Self-contained Vercel function. Query params: `symbol`, `state`, `side`, `page`, `limit`, `sort`, `order`. Returns paginated `PositionRow[]` with metadata. Inline Supabase client (no src/ imports per AGENTS.md rules).
- [ ] **7.2** Create `api/trades-log.ts` — `GET /api/trades-log` — Self-contained Vercel function. Query params: `symbol`, `side`, `from`, `to`, `page`, `limit`, `sort`, `order`. Returns paginated `TradesLogRow[]` with metadata. Inline Supabase client.
- [ ] **7.3** Update `vercel.json` — Add rewrites for `/api/positions` and `/api/trades-log`

### Phase 8: Dashboard Updates

- [ ] **8.1** Create `dashboard/src/hooks/usePositions.ts` — React Query hook fetching from `/api/positions` with polling interval
- [ ] **8.2** Create `dashboard/src/hooks/useTradeLog.ts` — React Query hook fetching from `/api/trades-log` with pagination
- [ ] **8.3** Create `dashboard/src/hooks/useRealtimePositions.ts` — Supabase Realtime subscription for `positions` table changes (INSERT/UPDATE)
- [ ] **8.4** Create `dashboard/src/components/PositionsTable.tsx` — Active positions table: symbol, side, state, entry price, current price, unrealized P&L (color-coded), TP/SL levels, time in trade. Live updates via Realtime.
- [ ] **8.5** Create `dashboard/src/components/TradeLogTable.tsx` — Completed trades table: symbol, side, entry/exit price+time, P&L (color-coded), exit reason, highest TP hit, confirmation score. Sortable, paginated.
- [ ] **8.6** Update `dashboard/src/components/AlertDetailPanel.tsx` — Add VPVR data section: POC, VAH, VAL, confirmation score, timeframe breakdown. Display when alert has associated VPVR data in `raw_payload`.
- [ ] **8.7** Update `dashboard/src/components/KpiCards.tsx` — Add 2 new KPI cards: "Open Positions" (count from positions API), "Total P&L" (sum of net_pnl from trades_log). Keep existing 4 cards.
- [ ] **8.8** Update `dashboard/src/App.tsx` — Add tab navigation (Alerts | Positions | Trade Log). Import and render PositionsTable and TradeLogTable in their respective tabs. Wire up useRealtimePositions.

### Phase 9: Testing

- [ ] **9.1** Create `tests/positions-api.test.ts` — Unit tests for GET /api/positions: pagination, filtering by state/symbol/side, sorting, invalid params
- [ ] **9.2** Create `tests/trades-log-api.test.ts` — Unit tests for GET /api/trades-log: pagination, filtering by symbol/date range, sorting
- [ ] **9.3** Create `tests/e2e/positions-api.e2e.test.ts` — E2E test: insert a position via Supabase, query via API, verify response structure
- [ ] **9.4** Create `tests/e2e/trades-log.e2e.test.ts` — E2E test: insert a trade log via Supabase, query via API, verify P&L calculations
- [ ] **9.5** Create `tests/e2e/bot-lifecycle.e2e.test.ts` — E2E test: full bot lifecycle in dry-run mode — alert → VPVR → entry calc → position created → simulated ticks → TP progression → close → trade logged. Uses real Supabase but mock TopstepX API.
- [ ] **9.6** Create `tests/e2e/backtest.e2e.test.ts` — E2E test: run backtest against seeded alerts with mocked historical bars, verify result statistics

### Phase 10: Validation + Polish

- [ ] **10.1** Run `npm run validate` — Ensure lint + typecheck + all tests (unit + e2e) pass with zero warnings
- [ ] **10.2** Run `npm run bot -- --dry-run` — Verify CLI starts, connects to SignalR, shows live status, handles Ctrl+C
- [ ] **10.3** Run `npm run backtest` — Verify backtest runs against stored alerts, prints formatted results
- [ ] **10.4** Verify dashboard shows positions table and trade log with correct data
- [ ] **10.5** Update `AGENTS.md` — Add new tables to schema section, add new env vars if any, add bot/backtest commands

## Dependencies

```
Phase 1 (Types + DB) ─── no dependencies
    │
    ├──► Phase 2 (Pure Logic) ─── depends on 1.1 (bot types), 1.2 (backtest types)
    │       │
    │       ├──► Phase 3 (Position Manager) ─── depends on 2.1, 2.3
    │       │       │
    │       │       ├──► Phase 4 (I/O Services) ─── depends on 3.1
    │       │       │       │
    │       │       │       └──► Phase 5 (Runner + CLI) ─── depends on 4.1–4.7
    │       │       │
    │       │       └──► Phase 5 (also depends on 3.1 directly)
    │       │
    │       └──► Phase 6 (Backtest) ─── depends on 2.5 (simulator)
    │
    ├──► Phase 7 (API) ─── depends on 1.3, 1.4, 1.6 (DB tables + types)
    │       │
    │       └──► Phase 8 (Dashboard) ─── depends on 7.1, 7.2
    │
    └──► Phase 9 (Testing) ─── depends on all phases
            │
            └──► Phase 10 (Validation) ─── depends on all phases
```

**Critical path:** Phase 1 → 2 → 3 → 4 → 5 (bot runner)
**Parallel track:** Phase 1 → 7 → 8 (API + dashboard, can be built alongside bot)

## Notes

1. **API functions are self-contained** — `api/*.ts` must NOT import from `src/`. Inline Supabase client initialization per AGENTS.md rules.
2. **Reuse existing TopstepX client** — `src/services/topstepx/client.ts` already has `placeOrder()`, `cancelOrder()`, `closePosition()`, `getHistoricalBars()`, `getCurrentContractId()`. The `TradeExecutor` wraps these, adding dry-run support.
3. **Reuse existing VPVR calculator** — `src/services/vpvr/calculator.ts` already implements the full algorithm. Entry calculator uses its output.
4. **Reuse existing confirmation engine** — `src/services/confirmation/engine.ts` for validating alerts before entry.
5. **SL is in-memory** — The bot monitors SignalR ticks and sends market close on SL breach. No stop orders placed on the exchange. More reliable than modifying stop orders with network latency.
6. **Supabase writes are rate-limited** — 5-second flush interval with dirty flag pattern. Only state changes trigger writes.
7. **LLM is fire-and-forget** — 10-second timeout on Claude Code CLI invocation. Never blocks trade execution.
8. **Bot runs locally** — Not on Vercel. Requires persistent SignalR WebSocket connections. Started via `npm run bot`.
9. **Backtest is pure simulation** — No API calls for order execution. Fetches stored alerts + historical bars, simulates full lifecycle.
10. **Existing test count**: 259 unit + 41 e2e tests. This plan adds ~140 unit + ~4 e2e tests.

---

PLANNING COMPLETE - Ready for build mode
