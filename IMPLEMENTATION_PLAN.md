# Implementation Plan

**Last Updated:** 2026-02-14
**Status:** COMPLETE
**Issue:** #22 — Expand CONTRACT_SPECS to all 51 Topstep symbols + 1M data pipeline

## Summary

Expand `CONTRACT_SPECS` from the original 8 symbols to all 51 Topstep tradable products has been completed in the code. Three scripts have been added (fetch-1m-bars, verify-contract-ids, ml-optimize-backtest). The `bars_1m` Supabase table and migration exist. Database types are updated.

The remaining work is fixing **3 test failures** caused by the contract spec expansion (stale assertions) and a pre-existing dashboard issue, then updating the test suite to properly validate all 51 symbols.

## Specifications Analyzed
- [x] specs/expand-contract-specs-to-all-51-topstep-symbols-1m.md — Analyzed

## Database Analysis

### Existing Tables
| Table | Migration | Status |
|-------|-----------|--------|
| `alerts` | 20260212000000 | Exists, up to date |
| `positions` | 20260213000000 + 20260213100000 | Exists, up to date |
| `trades_log` | 20260213000001 + 20260213100000 | Exists, up to date |
| `bars_1m` | 20260214000000 | **NEW** — Created for this feature |

### Schema Changes Required
None. The `bars_1m` table migration already exists with correct schema:
- `(symbol, timestamp)` unique constraint
- Indexes on `(symbol, timestamp)`, `timestamp`, `contract_id`
- RLS enabled with service role full access + anon read
- Types added to `src/types/database.ts` (`Bars1mRow`, `Bars1mInsert`)

## Gap Analysis

### Already Implemented (No work needed)
| Item | File | Status |
|------|------|--------|
| 51 symbols in CONTRACT_SPECS | `src/services/topstepx/types.ts` | Done — all 51 symbols present |
| `quarterly_fjnv` expiry cycle for PL | `src/services/topstepx/types.ts:267` | Done |
| `getCurrentContractId()` supports `quarterly_fjnv` | `src/services/topstepx/client.ts:213-218` | Done |
| `bars_1m` table migration | `supabase/migrations/20260214000000` | Done |
| `bars_1m` database types | `src/types/database.ts:163-203` | Done |
| `fetch-1m-bars.ts` script | `scripts/fetch-1m-bars.ts` | Done |
| `verify-contract-ids.ts` script | `scripts/verify-contract-ids.ts` | Done |
| `ml-optimize-backtest.ts` script | `scripts/ml-optimize-backtest.ts` | Done |
| MINI_SYMBOLS set updated | `src/services/topstepx/types.ts:800-808` | Done |
| `getMicroEquivalent()` function | `src/services/topstepx/types.ts:815-817` | Done |

### Test Failures (Must fix)

**3 failing tests across 2 files:**

#### 1. `tests/dynamic-symbols-eod-sync.test.ts` — 1 failure
- **Test:** `NG contract ID prefix is correct for resolution`
- **Line 129:** `expect(CONTRACT_SPECS['NG'].contractIdPrefix).toBe('CON.F.US.NG')`
- **Actual:** `'CON.F.US.NGE'` (corrected during API verification)
- **Fix:** Update test assertion to match the verified API prefix `'CON.F.US.NGE'`

#### 2. `tests/dashboard-realtime-fixes.test.ts` — 2 failures
- **Test:** `AlertsTable uses useTick > imports useTick hook` (line 58)
- **Test:** `AlertsTable uses useTick > calls useTick() in component body` (line 62)
- **Root cause:** `dashboard/src/components/AlertsTable.tsx` does not import or use `useTick()`. The test expects it but it was never added (pre-existing issue, not caused by this feature).
- **Fix:** Add `useTick()` import and call to `AlertsTable.tsx` (matches pattern in `PositionsTable.tsx` and `KpiCards.tsx`)

### Test Coverage Gaps (Should fix)

#### 3. `tests/contract-specs.test.ts` — Outdated
- **Line 16:** `allSymbols` only lists 8 symbols (`ES, NQ, MES, MNQ, MYM, MGC, MCL, MBT`)
- **Line 34:** `expiryCycle` validation only accepts `['quarterly', 'monthly']`, missing `'quarterly_fjnv'`
- **Fix:** Update `allSymbols` to include all 51 symbols, update expiryCycle validation to include `'quarterly_fjnv'`

## Prioritized Tasks

### Phase 1: Fix Failing Tests (HIGH PRIORITY)

- [x] **Task 1** — Fix NG contract ID assertion in `tests/dynamic-symbols-eod-sync.test.ts:129` — Changed expected value from `'CON.F.US.NG'` to `'CON.F.US.NGE'` and updated regex

- [x] **Task 2** — Fix AlertsTable useTick in `dashboard/src/components/AlertsTable.tsx` — Added `useTick` import and call matching PositionsTable/KpiCards pattern

### Phase 2: Update Test Coverage

- [x] **Task 3** — Updated `tests/contract-specs.test.ts` `allSymbols` array to include all 51 symbols

- [x] **Task 4** — Updated expiryCycle validation to accept `'quarterly_fjnv'`

- [x] **Task 5** — Added `quarterly_fjnv` test cases for `getCurrentContractId` — 6 tests covering PL F/J/N/V cycle with rollover

- [x] **Task 6** — Added tests for all 28 corrected contract ID prefixes + format validation for all 51 symbols

### Phase 3: E2E Tests

- [x] **Task 7** — E2E test: `tests/e2e/bars-1m-schema.e2e.test.ts` — 24 tests covering schema, columns, constraints, indexes, RLS, and types

- [x] **Task 8** — E2E test: `tests/e2e/contract-specs-51.e2e.test.ts` — Verifies all 51 symbols have valid `CON.F.US.*` prefix format

- [x] **Task 9** — E2E test: `tests/e2e/contract-specs-51.e2e.test.ts` — Verifies `getCurrentContractId()` produces valid contract IDs for all 51 symbols with correct month codes per expiry cycle

### Phase 4: Validation

- [x] **Task 10** — `npm run validate` passes: 0 lint warnings, 0 type errors, 540 unit tests, 197 e2e tests

## Dependencies

```
Task 1 ──┐
Task 2 ──┤
Task 3 ──┼──→ Task 10 (final validation)
Task 4 ──┤
Task 5 ──┤
Task 6 ──┤
Task 7 ──┤
Task 8 ──┤
Task 9 ──┘
```

Tasks 1-9 are independent of each other and can be done in any order. Task 10 depends on all others.

## Notes

1. **No code changes needed to source files** (except AlertsTable.tsx for the pre-existing useTick bug). All CONTRACT_SPECS expansion, client.ts quarterly_fjnv support, database migration, and scripts are already implemented.

2. **The NG prefix change** from `CON.F.US.NG` to `CON.F.US.NGE` was a legitimate API-verified correction. The test was written before the verification pass and needs updating.

3. **The AlertsTable useTick issue** is a pre-existing bug from Issue #8 (dashboard realtime fixes) — the fix was applied to PositionsTable and KpiCards but missed AlertsTable. Adding it follows the exact same pattern.

4. **The ml-optimize-backtest.ts script** has a stale `EXTENDED_SPECS` object (line 47-51) with specs that are now in CONTRACT_SPECS. This is cosmetic — the script falls through to CONTRACT_SPECS first, so the extended specs are dead code. Not blocking, but could be cleaned up.

---

BUILD COMPLETE — All tasks implemented

### Additional Fix
- Fixed LE (Live Cattle) `pointValue` from 40000 to 400 (was incorrectly set to contract size in lbs instead of dollar value per point; tickValue/tickSize = 10/0.025 = 400)
