# TopstepX Trading Bot - Operational Guide

> This file contains operational learnings for AI agents working on this codebase.
> Keep it brief (~100 lines). Status/progress belongs in IMPLEMENTATION_PLAN.md.

## Project Overview

TypeScript/Node.js webhook server that receives TradingView alerts and executes trades on TopstepX via the ProjectX Gateway API. Deployed to Vercel as serverless functions with Supabase for data persistence.

## Development Workflows

### Ralph Loop (Specification-Driven)
```bash
./ralph/loop.sh plan    # Generate/update IMPLEMENTATION_PLAN.md (unlimited iterations)
./ralph/loop.sh build   # Implement from plan (unlimited iterations until complete)
```

### ADW (GitHub Issue-Driven)
```bash
uv run adws/adw_ralph_iso.py <issue-number> [adw-id] [options]
# Options:
#   --plan-iterations 0   # Unlimited planning iterations
#   --build-iterations 0  # Unlimited build iterations
#   --skip-tests          # Skip test phase
#   --skip-review         # Skip review phase
```

ADW Pipeline: Issue → Spec → Plan → Build → Test → Review → PR → Merge

## Build & Validate Commands

```bash
# Backpressure (run in this order)
npm run lint                   # ESLint with 0-warnings policy
npm run typecheck              # TypeScript check
npm run test                   # Unit tests (Vitest)
npm run test:e2e               # End-to-end tests

# Full validation
npm run validate               # Runs lint + typecheck + test + test:e2e

# Bot (local process with SignalR streaming)
npm run bot -- --account-id <id> --symbol ES --quantity 1 --dry-run
npm run backtest -- --from 2026-01-01 --to 2026-01-31 --symbol ES --verbose
```

## Supabase Database Commands

```bash
# Execute SQL directly (requires SUPABASE_ACCESS_TOKEN in .env.local)
./scripts/supabase-sql.sh "SELECT * FROM alerts LIMIT 5"

# Run migrations
export SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d= -f2)
supabase db push               # Push pending migrations
supabase db dump --schema public  # Dump current schema
supabase migration list        # List migration status

# Query alerts via REST API
curl -s "https://mmudpobhfstanoenoumz.supabase.co/rest/v1/alerts?limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

**IMPORTANT**: ADW agents can and should execute SQL directly using these commands. Do NOT ask users to run SQL manually.

## Architecture

### File Structure
```
api/                           # Vercel serverless functions (SELF-CONTAINED)
├── webhook.ts                 # TradingView webhook handler
├── alerts.ts                  # GET /api/alerts (paginated)
├── alerts/[id].ts             # GET /api/alerts/:id (detail)
├── positions.ts               # GET /api/positions (paginated)
├── trades-log.ts              # GET /api/trades-log (paginated)
├── health.ts                  # Health check endpoint
src/
├── lib/                       # Shared utilities
│   ├── supabase.ts           # Supabase client
│   ├── validation.ts         # Input validation
│   └── logger.ts             # Structured logging
├── bot/                       # Autonomous trading bot
│   ├── runner.ts             # BotRunner orchestrator
│   ├── cli.ts                # CLI entry point (`npm run bot`)
│   ├── position-manager.ts   # Position state machine
│   ├── trade-executor.ts     # TopstepX order execution
│   ├── trailing-stop.ts      # TP/SL progression logic
│   ├── entry-calculator.ts   # VPVR-based entry price calculation
│   ├── alert-listener.ts     # Supabase Realtime alert subscription
│   ├── supabase-writer.ts    # Rate-limited DB write queue
│   ├── llm-analyzer.ts       # Fire-and-forget LLM trade analysis
│   └── backtest/             # Backtesting engine
│       ├── engine.ts         # Alert fetch + simulate + aggregate
│       ├── simulator.ts      # Pure trade simulation
│       ├── reporter.ts       # Terminal output formatting
│       └── cli.ts            # CLI entry point (`npm run backtest`)
├── services/                  # External service clients
│   └── topstepx/             # ProjectX Gateway API
├── types/                     # TypeScript definitions
│   ├── index.ts              # Application types
│   └── database.ts           # Supabase database types
dashboard/                     # React dashboard (Vite + Tailwind)
├── src/
│   ├── App.tsx               # Tab nav: Alerts | Positions | Trade Log
│   ├── hooks/                # React Query + Realtime hooks
│   └── components/           # Tables, KPI cards, filters
tests/                         # Test files
├── *.test.ts                 # Unit tests
└── e2e/                      # End-to-end tests
specs/                         # Feature specifications (source of truth)
supabase/
└── migrations/               # Database migrations
```

### Vercel API Functions
**CRITICAL**: API functions in `api/*.ts` must be SELF-CONTAINED:
- Inline all dependencies or use npm packages only
- Do NOT import from `src/lib/*` (module resolution fails at runtime)
- Each function compiles independently

## Supabase Database Schema

**Project:** mmudpobhfstanoenoumz
**Tables:**

### alerts
Stores incoming TradingView webhook alerts.
```sql
id: UUID (PK)
created_at: TIMESTAMPTZ
symbol: TEXT
action: trade_action (enum: buy, sell, close, close_long, close_short)
quantity: INTEGER
order_type: order_type (enum: market, limit, stop, stop_limit)
price: DECIMAL(12,4)
stop_loss: DECIMAL(12,4)
take_profit: DECIMAL(12,4)
comment: TEXT
status: alert_status (enum: received, processing, executed, failed, cancelled)
error_message: TEXT
order_id: TEXT
executed_at: TIMESTAMPTZ
raw_payload: JSONB
```

### positions
Tracks live and historical trading positions managed by the bot.
```sql
id: UUID (PK)
alert_id: UUID (FK → alerts.id)
symbol: TEXT
side: position_side (enum: long, short)
state: position_state (enum: pending_entry, active, tp1_hit, tp2_hit, tp3_hit, closed, cancelled)
entry_price: DECIMAL(12,4)
target_entry_price: DECIMAL(12,4)
quantity: INTEGER
current_sl: DECIMAL(12,4)
initial_sl: DECIMAL(12,4)
tp1_price, tp2_price, tp3_price: DECIMAL(12,4)
unrealized_pnl: DECIMAL(12,4) DEFAULT 0
vpvr_poc, vpvr_vah, vpvr_val: DECIMAL(12,4)
llm_reasoning: TEXT
llm_confidence: DECIMAL(5,4)
created_at, updated_at: TIMESTAMPTZ
```

### trades_log
Immutable record of completed trades with full entry/exit data.
```sql
id: UUID (PK)
position_id: UUID (FK → positions.id)
symbol: TEXT
side: position_side
entry_price, exit_price: DECIMAL(12,4)
quantity: INTEGER
gross_pnl, net_pnl: DECIMAL(12,4)
entry_time, exit_time: TIMESTAMPTZ
exit_reason: TEXT
highest_tp_hit: TEXT
tp_progression: TEXT[]
vpvr_poc, vpvr_vah, vpvr_val: DECIMAL(12,4)
created_at: TIMESTAMPTZ
```

**CRITICAL**: When implementing features that touch the database:
1. Check `src/types/database.ts` for existing types
2. Check `supabase/migrations/` for existing schema
3. Use existing tables/columns before creating new ones
4. Update types when modifying schema

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WEBHOOK_SECRET` | Secret for validating TradingView alerts |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `TOPSTEPX_USERNAME` | ProjectX account username |
| `TOPSTEPX_API_KEY` | ProjectX API key |

## Code Patterns

- **API Routes**: Self-contained, validate input, proper HTTP codes
- **Services**: Async/await, typed responses, error handling
- **Database**: Use Supabase client from `src/lib/supabase.ts`
- **Tests**: Vitest for unit, Playwright/Vitest for e2e

## Operational Learnings

1. **Don't assume not implemented** - Search codebase before writing new code
2. **No duplicates** - Reuse existing utilities, types, and patterns
3. **Major changes = full refactor** - Update all affected code paths
4. **Database first** - Check schema before implementing data operations
5. **Self-contained API** - Vercel functions can't import from src/

## When to Update This File

- Discovered a non-obvious build step
- Found a pattern that prevents bugs
- Added new database tables/columns
- Learned something that would save future loops time
