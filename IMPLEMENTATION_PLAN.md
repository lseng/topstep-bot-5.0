# Implementation Plan

**Last Updated:** 2026-02-12T08:05:00Z
**Status:** COMPLETE
**Spec:** `specs/e2e-smoke-test-webhook-supabase-dashboard-pipeline.md` (GitHub Issue #6)

## Summary

Validate and fix the full webhook pipeline: **TradingView webhook → Vercel function → Supabase INSERT → Dashboard display → Realtime updates**. Fix one failing e2e test, fix a dashboard `alertTime` field mismatch, remove an orphaned Neon migration file, and clean up stale mock code in tests. Then add a comprehensive pipeline e2e test that covers all 5 positive webhook scenarios and 5 negative scenarios from the spec.

## Specifications Analyzed
- [x] `specs/e2e-smoke-test-webhook-supabase-dashboard-pipeline.md` — E2E smoke test plan with 5 phases

## Database Analysis

### Existing Tables
- **`alerts`** — defined in `supabase/migrations/20260212000000_create_alerts_table.sql`
  - Columns: `id`, `created_at`, `symbol`, `action`, `quantity`, `order_type`, `price`, `stop_loss`, `take_profit`, `comment`, `status`, `error_message`, `order_id`, `executed_at`, `raw_payload`
  - Enums: `trade_action`, `order_type`, `alert_status`
  - Indexes on `created_at`, `symbol`, `status`, `(symbol, created_at)`
- **Realtime** — enabled via `supabase/migrations/20260212100000_enable_realtime_and_anon_read.sql`
- **RLS** — service role full access, anon read-only

### Schema Changes Required
None. The existing Supabase schema is correct and matches `src/types/database.ts`.

## Gap Analysis

### What's Working (Verified)
- **Webhook handler** (`api/webhook.ts`): JSON + CSV parsing, validation, secret check, Supabase storage — all passing (196 unit tests, 28/29 e2e tests)
- **Alerts API** (`api/alerts.ts`): Pagination, filtering by symbol/action/status, sorting, date range — all passing
- **Alert Detail API** (`api/alerts/[id].ts`): UUID validation, OHLCV extraction from `raw_payload` — all passing
- **Alert storage** (`src/services/alert-storage.ts`): Maps `price` to `open` when no explicit price, writes `raw_payload` with all OHLCV fields
- **Dashboard AlertsTable** (`dashboard/src/components/AlertsTable.tsx`): `extractOHLCV()` reads OHLCV correctly from `raw_payload`
- **Realtime** (`dashboard/src/hooks/useRealtimeAlerts.ts`): Subscribes to INSERT/UPDATE events on `alerts` table
- **DB types** (`src/types/database.ts`): Matches Supabase migration schema
- **RLS policies**: Service role INSERT, anon SELECT — both configured
- **Realtime publication**: `alerts` table in `supabase_realtime` publication
- **No orphaned Neon imports in API routes**: Confirmed via grep — `src/lib/db.ts` is only referenced in `src/lib/migrate.ts` and the e2e test mock
- **Lint**: 0 warnings
- **TypeCheck**: No errors

### Bugs Found

1. **Failing E2E test** (`tests/e2e/webhook.e2e.test.ts:484-508`): Test "succeeds without database when not configured" mocks `isDatabaseConfigured()` from `src/lib/db` to return `false`, but the webhook handler no longer checks `isDatabaseConfigured()` — it always calls `saveAlert()` via Supabase. The mock of `db.ts` has no effect since the webhook handler doesn't import it. The test expects `alertId` to be `undefined` and `saveAlert` to not be called, but `saveAlert` is called (returns `'e2e-alert-uuid-001'`).

2. **Dashboard alertTime field mismatch** (`dashboard/src/components/AlertsTable.tsx:168`): Reads `raw.time` but `alert-storage.ts:19` writes it as `raw.alertTime`. The dashboard will never display the alert time in the expanded row.

3. **Orphaned old Neon migration** (`migrations/001_create_alerts_table.sql`): Uses a completely different schema (e.g., `secret_hash`, `open_price`, `high_price` columns) than the actual Supabase table. Should be removed to avoid confusion.

### Missing E2E Coverage

The spec defines 5 positive webhook tests and 5 negative tests that should be automated as pipeline e2e tests. Current e2e tests cover most scenarios but with mocked storage. The spec wants an e2e test file that validates the full pipeline shape.

## Prioritized Tasks

### Phase 1: Fix Bugs (Highest Priority)

- [x] **1.1** Fix failing e2e test in `tests/e2e/webhook.e2e.test.ts` — Removed stale `vi.mock('../../src/lib/db', ...)`, `mockIsDatabaseConfigured` declarations, and the dead "succeeds without database when not configured" test case. Updated `src/lib/migrate.test.ts` to handle removed migrations directory.

- [x] **1.2** Fix dashboard alertTime field mismatch — Changed `raw.time` to `raw.alertTime` in `dashboard/src/components/AlertsTable.tsx:168`.

- [x] **1.3** Remove orphaned Neon migration file — Deleted `migrations/001_create_alerts_table.sql` and the empty `migrations/` directory.

### Phase 2: Pipeline E2E Test

- [x] **2.1** Created `tests/e2e/pipeline.e2e.test.ts` with 11 tests: 5 positive (buy/sell/close/CSV/minimal), 5 negative (wrong secret/missing action/invalid action/missing ticker/GET), plus price mapping verification.

### Phase 3: Validation & Cleanup

- [x] **3.1** `npm run validate` passed — 0 lint warnings, 0 type errors, 194 unit tests passed, 39 e2e tests passed.

## Dependencies

```
1.1 (fix failing test) → 3.1 (validate)
1.2 (fix alertTime)    → 3.1 (validate)
1.3 (remove old migration) → 3.1 (validate)
2.1 (pipeline e2e test) → 3.1 (validate)
```

All Phase 1 tasks are independent of each other.
Phase 2 is independent of Phase 1.
Phase 3 depends on all of Phase 1 and Phase 2.

## Notes

1. The `src/lib/db.ts` (Neon client) is still used by `src/lib/migrate.ts` for the old Neon migration system. The spec notes this is expected — the `@neondatabase/serverless` package remains in `package.json` for the migrate script but is no longer used by API routes. No action needed here.

2. The existing e2e tests mock Supabase/storage rather than hitting a live database. This is correct for CI — the spec's curl-based tests in Phases 1-4 are manual verification steps, not automated tests. Our automated e2e tests validate the same code paths with mocks.

3. Dashboard verification (Phase 4 of spec) and schema audit (Phase 5 of spec) are addressed by the bug fixes in Phase 1 and code review done during planning. No additional automated tests needed for visual dashboard verification.

4. The `extractOHLCV()` function in `AlertsTable.tsx:55-65` correctly reads from `raw_payload` fields (`raw.open`, `raw.high`, etc.) — this matches what `alert-storage.ts` writes. Only the `alertTime` field was mismatched.

BUILD COMPLETE - All tasks implemented
