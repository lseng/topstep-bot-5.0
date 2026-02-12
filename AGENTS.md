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
├── health.ts                  # Health check endpoint
src/
├── lib/                       # Shared utilities
│   ├── supabase.ts           # Supabase client
│   ├── validation.ts         # Input validation
│   └── logger.ts             # Structured logging
├── services/                  # External service clients
│   └── topstepx/             # ProjectX Gateway API
├── types/                     # TypeScript definitions
│   ├── index.ts              # Application types
│   └── database.ts           # Supabase database types
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
