# Expand contract specs to all 51 Topstep symbols + 1M data pipeline

**Type:** Feature
**GitHub Issue:** #22
**Labels:** none

## Overview

## Summary

Expand `CONTRACT_SPECS` from 8 symbols to all 51 Topstep tradable products, verify all contract ID prefixes against the TopstepX API, and build a 1-minute bar data pipeline to Supabase for backtesting.

## Completed Work

### Contract Specs Expansion
- All 51 symbols from [Topstep tradable products](https://help.topstep.com/en/articles/8284206) added to `CONTRACT_SPECS`
- 30 contract ID prefix corrections applied based on `searchContracts` API verification (e.g. `6A→DA6`, `GC→GCE`, `ZN→TYA`, `ZB→USA`)
- Tick sizes and values confirmed from API data (6 corrections: 6A, 6S, 6M, 6N, LE, ZT)
- Added `quarterly_fjnv` expiry cycle for Platinum (Jan/Apr/Jul/Oct)
- Fixed ZT 2-Year T-Note: pointValue $1,000→$2,000 (face value $200K)

### Asset Classes Covered
| Class | Symbols |
|-------|---------|
| Equity Index | ES, MES, NQ, MNQ, YM, MYM, RTY, M2K, NKD |
| Crypto | MBT, MET |
| FX | 6A, 6B, 6C, 6E, 6J, 6S, E7, M6E, M6A, M6B, 6M, 6N |
| Energy | CL, QM, MCL, NG, QG, MNG, RB, HO |
| Metals | GC, MGC, SI, SIL, HG, MHG, PL |
| Agriculture | ZC, ZW, ZS, ZM, ZL, HE, LE |
| Interest Rates | ZT, ZF, ZN, TN, ZB, UB |

### 1-Minute Bar Data Pipeline
- Created `bars_1m` Supabase table with `(symbol, timestamp)` unique constraint
- Built `scripts/fetch-1m-bars.ts` — incremental fetch from TopstepX API to Supabase
- **722,792 bars** stored across **35 symbols** (30 days of 1M data)
- Incremental: re-running only fetches new bars since latest timestamp per symbol
- Rate limiting with exponential backoff on 429 errors

### Data Availability by Symbol
| Category | Symbols with Data | Bars |
|----------|-------------------|------|
| Full 30-day (~25K-30K bars) | ES, NQ, MES, MNQ, YM, MYM, RTY, M2K, 6A-6N, ZT-UB | ~25K-30K each |
| Partial (monthly contract roll) | NKD, GC, MGC, NG, MNG, HO, RB, QG, CL, MCL, QM, HE, LE | 300-19K each |
| No API data available | MBT, MET, E7, M6E, M6A, M6B, SI, SIL, HG, MHG, PL, ZC-ZL | 0 |

### Scripts Added
- `scripts/fetch-1m-bars.ts` — Fetch 1M bars from TopstepX → Supabase
- `scripts/verify-contract-ids.ts` — Test all contract IDs against API
- `scripts/ml-optimize-backtest.ts` — ML grid search for strategy optimization

## Files Changed
- `src/services/topstepx/types.ts` — 51 symbols in CONTRACT_SPECS
- `src/services/topstepx/client.ts` — quarterly_fjnv expiry cycle support
- `src/types/database.ts` — bars_1m table types
- `supabase/migrations/20260214000000_create_bars_1m_table.sql`
- `IMPLEMENTATION_PLAN.md` — Updated Phase 1 status

## Labels
data, enhancement

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/22
- Created: 2026-02-14 04:49:34+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #22*
