# Autonomous Trading Pipeline: VPVR-Based Entry, Trailing TP/SL, Backtest, CLI Bot, LLM Analysis

**Type:** Feature
**GitHub Issue:** #10
**Labels:** none

## Overview

## Overview

Build a complete autonomous trading pipeline that uses **VPVR (Volume Profile Visible Range)** analysis to confirm TradingView alerts, find optimal entry prices, manage positions with progressive trailing stops, and log trade reasoning via LLM.

### What Already Exists
- Webhook→Supabase pipeline (alerts stored with status tracking)
- VPVR Calculator (`src/services/vpvr/`) — ported from Fr3d0's Pine Script
- Confirmation Engine (`src/services/confirmation/`) — 1M+5M dual-timeframe scoring
- TopstepX REST client (`src/services/topstepx/client.ts`) — auth, orders, positions, historical bars
- TopstepX SignalR streaming (`src/services/topstepx/streaming.ts`) — Market Hub + User Hub
- React dashboard with alerts table, filtering, Supabase Realtime
- 259 unit + 41 e2e tests passing

---

## Features to Build

### 1. Smart Entry (VPVR-Based Limit Orders)
When a TradingView alert fires, instead of market ordering:
- Calculate VPVR on the 5M timeframe
- **BUY**: place limit order at/near **VAL** (Value Area Low — discount zone)
- **SELL**: place limit order at/near **VAH** (Value Area High — premium zone)
- If price never reaches entry and an opposing alert comes → cancel, start over

### 2. Position Management with Trailing TP/SL
TP zones derived from **5M VPVR levels**:

| | BUY (Long) | SELL (Short) |
|---|---|---|
| **Entry** | VAL | VAH |
| **TP1** | POC | POC |
| **TP2** | VAH | VAL |
| **TP3** | Range High | Range Low |
| **Initial SL** | Below VAL | Above VAH |

Progressive trailing stop logic:
- **TP1 hit** → move SL to breakeven (entry price)
- **TP2 hit** → move SL to TP1
- **TP3 hit** → move SL to TP2
- No actual "take profit" orders — ride until opposing alert or trailing SL hit

**SL managed in-memory** (not via stop orders) — bot monitors SignalR ticks and sends market close when SL is breached. More reliable than modifying stop orders with network latency.

### 3. Backtest Engine
- Fetch all stored alerts from Supabase
- For each alert, fetch historical 5M bars at that timestamp
- Run VPVR, simulate the full position lifecycle (entry, TP progression, trailing SL)
- Output: win rate, avg P&L, profit factor, Sharpe ratio, per-trade breakdown
- Pure simulation — no API calls for order execution

### 4. Local CLI Bot Runner (`npm run bot`)
- Interactive CLI command that runs locally (not on Vercel — needs persistent SignalR connections)
- Connects to: SignalR Market Hub (tick streaming) + User Hub (order/position events) + Supabase Realtime (alert listener)
- Full lifecycle: alert → VPVR → entry → position → trailing SL → close
- Shows live terminal status: current positions, P&L, pending orders, last alert
- Graceful shutdown with Ctrl+C

### 5. Rate-Limited Supabase Writes
- Buffer position updates, flush every 5 seconds
- Only write on state changes (not every tick)
- Dirty flag pattern — mark positions as dirty, batch upsert on flush
- Prevents hitting Supabase rate limits during active trading

### 6. Dashboard Updates
- **PositionsTable**: active positions with real-time P&L, state, TP/SL levels
- **TradeLogTable**: completed trades with entry/exit, P&L, LLM reasoning
- **VpvrPanel**: VPVR data on alert detail (POC, VAH, VAL, confirmation score)
- **KpiCards**: add P&L and position count metrics
- Supabase Realtime subscriptions for live position updates

### 7. LLM Trade Analysis (Claude Code CLI)
- When about to take a trade, invoke Claude Code CLI programmatically
- Pass context: VPVR levels, price action, alert details, confirmation score
- Get back: reasoning, confidence score, description
- Store with trade record for bookkeeping and strategy review
- **Fire-and-forget**: 10-second timeout, never blocks execution

---

## Position State Machine

```
[Alert] → VPVR Entry Calc → pending_entry (limit order placed)
                                  │
              ┌───────────────────┼──────────────────┐
          [filled]          [opposing alert]    [timeout/rejected]
              │                   │                   │
           active            cancelled            cancelled
         (SL set)
              │
        [price ticks]
              │
    ┌─────────┼─────────┬──────────┐
 [TP1 hit] [TP2 hit] [TP3 hit]  [SL hit]
    │         │         │          │
 tp1_hit   tp2_hit   tp3_hit    closed
 SL=entry  SL=TP1    SL=TP2
    │         │         │
 [SL hit]  [SL hit]  [SL hit]
    │         │         │
  closed    closed    closed
```

From any active state: opposing alert → closed | manual close → closed

---

## Database Schema

### New Table: `positions`
```sql
CREATE TYPE position_state AS ENUM (
  'pending_entry', 'active', 'tp1_hit', 'tp2_hit', 'tp3_hit', 'closed', 'cancelled'
);
CREATE TYPE position_side AS ENUM ('long', 'short');

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  alert_id UUID REFERENCES alerts(id),
  symbol TEXT NOT NULL,
  side position_side NOT NULL,
  state position_state DEFAULT 'pending_entry' NOT NULL,
  entry_order_id INTEGER,
  entry_price DECIMAL(12, 4),
  target_entry_price DECIMAL(12, 4),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  contract_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  current_sl DECIMAL(12, 4),
  initial_sl DECIMAL(12, 4),
  tp1_price DECIMAL(12, 4),
  tp2_price DECIMAL(12, 4),
  tp3_price DECIMAL(12, 4),
  unrealized_pnl DECIMAL(12, 4) DEFAULT 0,
  last_price DECIMAL(12, 4),
  vpvr_data JSONB,
  confirmation_score INTEGER,
  exit_price DECIMAL(12, 4),
  exit_reason TEXT,
  closed_at TIMESTAMPTZ,
  llm_reasoning TEXT,
  llm_confidence DECIMAL(5, 2)
);
```

### New Table: `trades_log`
```sql
CREATE TABLE trades_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  position_id UUID REFERENCES positions(id),
  alert_id UUID REFERENCES alerts(id),
  symbol TEXT NOT NULL,
  side position_side NOT NULL,
  entry_price DECIMAL(12, 4) NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  exit_price DECIMAL(12, 4) NOT NULL,
  exit_time TIMESTAMPTZ NOT NULL,
  exit_reason TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  gross_pnl DECIMAL(12, 4) NOT NULL,
  fees DECIMAL(12, 4) DEFAULT 0,
  net_pnl DECIMAL(12, 4) NOT NULL,
  vpvr_poc DECIMAL(12, 4),
  vpvr_vah DECIMAL(12, 4),
  vpvr_val DECIMAL(12, 4),
  highest_tp_hit TEXT,
  confirmation_score INTEGER,
  llm_reasoning TEXT,
  metadata JSONB DEFAULT '{}'::JSONB
);
```

---

## File Structure (~30 new files)

### Bot Core (`src/bot/`)
```
src/bot/
  types.ts                    Bot types (PositionState, ManagedPosition, BotConfig)
  entry-calculator.ts         Smart entry price from VPVR levels (pure function)
  entry-calculator.test.ts
  trailing-stop.ts            TP/SL progression logic (pure function)
  trailing-stop.test.ts
  position-manager.ts         State machine class
  position-manager.test.ts
  trade-executor.ts           Order placement via TopstepX API
  trade-executor.test.ts
  supabase-writer.ts          Debounced write queue class
  supabase-writer.test.ts
  alert-listener.ts           Supabase Realtime subscription
  alert-listener.test.ts
  llm-analyzer.ts             Claude Code CLI invocation
  llm-analyzer.test.ts
  runner.ts                   Main orchestrator class
  runner.test.ts
  cli.ts                      Entry point for `npm run bot`
  index.ts                    Barrel export
```

### Backtest (`src/bot/backtest/`)
```
src/bot/backtest/
  types.ts                    BacktestConfig, SimulatedTrade, BacktestResult
  simulator.ts                Pure trade simulation (no I/O)
  simulator.test.ts
  engine.ts                   Fetch alerts, run simulation, aggregate results
  engine.test.ts
  reporter.ts                 Format results for terminal output
  cli.ts                      Entry point for `npm run backtest`
  index.ts                    Barrel export
```

### Database + API + Dashboard
```
supabase/migrations/20260213000000_create_positions_table.sql
supabase/migrations/20260213000001_create_trades_log_table.sql
supabase/migrations/20260213000002_enable_realtime_positions.sql
api/positions.ts
api/trades-log.ts
dashboard/src/components/PositionsTable.tsx
dashboard/src/components/TradeLogTable.tsx
dashboard/src/hooks/usePositions.ts
dashboard/src/hooks/useTradeLog.ts
dashboard/src/hooks/useRealtimePositions.ts
```

### Modified Files
```
src/types/database.ts         Add positions + trades_log types
package.json                  Add "bot" and "backtest" scripts
vercel.json                   Add API rewrites
dashboard/src/App.tsx          Add positions/trade log views
dashboard/src/components/KpiCards.tsx     Add P&L KPIs
dashboard/src/components/AlertDetailPanel.tsx  Show VPVR data
```

---

## Implementation Phases

### Phase 1: Types + Database Schema
Bot types, backtest types, database types, 3 SQL migrations

### Phase 2: Pure Business Logic (no I/O)
`entry-calculator.ts`, `trailing-stop.ts`, `backtest/simulator.ts` — all pure functions with full test coverage

### Phase 3: Position Manager
State machine class with event-driven transitions and action commands

### Phase 4: I/O Services
Trade executor, Supabase write queue, alert listener, LLM analyzer — all with mocked tests

### Phase 5: Bot Runner + CLI
Main orchestrator wiring SignalR hubs + alert listener + position manager + executor + writer. Interactive CLI with live status display.

### Phase 6: Backtest Engine
Fetch stored alerts, simulate trades, aggregate and report results

### Phase 7: API Endpoints
GET /api/positions and GET /api/trades-log with pagination and filtering

### Phase 8: Dashboard
PositionsTable, TradeLogTable, VPVR panel, P&L KPIs, Realtime subscriptions

---

## Architecture Decisions

1. **SL in-memory, not stop orders** — monitor ticks via SignalR, send market close on breach. More reliable than modifying stop orders with network latency.
2. **SupabaseWriteQueue** — 5-second debounce with dirty flag pattern prevents rate limits.
3. **LLM is fire-and-forget** — 10-second timeout, never blocks trade execution.
4. **Backtest is pure** — no API calls, simulates fills from historical bar data.
5. **Dashboard is read-only** — all writes come from the bot process only.
6. **PositionManager is a class** (inherently stateful); entry-calculator and trailing-stop are pure functions.

## Test Strategy

~140 new unit tests + ~4 new e2e tests:
- Pure functions (entry calc, trailing stop, simulator): ~40 tests
- Position manager state machine: ~30 tests
- I/O services (mocked): ~30 tests
- Runner lifecycle: ~15 tests
- Backtest engine: ~15 tests
- API endpoints: ~10 tests

## Acceptance Criteria

- [ ] `npm run validate` passes (lint + typecheck + all tests)
- [ ] `npm run bot -- --dry-run` starts, connects to SignalR, shows live status
- [ ] `npm run backtest` runs against stored alerts, prints results
- [ ] Dashboard shows active positions and completed trade log
- [ ] LLM reasoning stored with trade records
- [ ] Supabase writes are rate-limited (no spam on every tick)
- [ ] Opposing alerts correctly cancel pending entries or close positions
- [ ] Trailing SL progression works: TP1→BE, TP2→TP1, TP3→TP2

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/10
- Created: 2026-02-13 00:34:12+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #10*
