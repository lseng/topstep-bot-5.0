# E2E Smoke Test: Webhook → Supabase → Dashboard Pipeline

**Type:** Maintenance
**GitHub Issue:** #6
**Labels:** none

## Overview

## Context

After fixing several deployment issues (ESM/CJS module resolution, Supabase client init, schema mismatches, Neon→Supabase migration), the full webhook pipeline needs comprehensive end-to-end validation. The database has been cleared of old test data — only fresh webhook-submitted alerts should exist going forward.

## Objective

Validate every link in the chain: **TradingView webhook → Vercel function → Supabase INSERT → Dashboard display → Realtime updates**. Identify and fix any remaining orphaned code, schema drift, or display bugs.

## Test Plan

### Phase 1: Webhook → Supabase (curl smoke tests)

Run each variation and verify the alert appears in Supabase with correct column values.

**Test 1 — Buy with full OHLCV:**
\`\`\`bash
curl -X POST https://topstep-bot-50.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<WEBHOOK_SECRET>",
    "ticker": "ES",
    "action": "buy",
    "quantity": 1,
    "open": 5895.00,
    "close": 5900.25,
    "high": 5905.00,
    "low": 5890.00,
    "volume": 12345,
    "interval": "5"
  }'
\`\`\`
**Expected DB row:**
| Column | Value |
|---|---|
| symbol | ES |
| action | buy |
| quantity | 1 |
| price | 5895.00 (mapped from open) |
| order_type | market |
| status | received |
| raw_payload | Contains open/high/low/close/volume/interval |

**Test 2 — Sell with different symbol:**
\`\`\`bash
curl -X POST https://topstep-bot-50.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<WEBHOOK_SECRET>",
    "ticker": "NQ",
    "action": "sell",
    "quantity": 2,
    "open": 21500.00,
    "close": 21485.50,
    "high": 21520.00,
    "low": 21470.00,
    "volume": 8700,
    "interval": "15"
  }'
\`\`\`

**Test 3 — Close position:**
\`\`\`bash
curl -X POST https://topstep-bot-50.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<WEBHOOK_SECRET>",
    "ticker": "ES",
    "action": "close",
    "quantity": 1,
    "open": 5910.00,
    "close": 5908.75,
    "high": 5912.00,
    "low": 5905.00,
    "volume": 9500,
    "interval": "5"
  }'
\`\`\`

**Test 4 — CSV format (text/plain):**
\`\`\`bash
curl -X POST https://topstep-bot-50.vercel.app/api/webhook \
  -H "Content-Type: text/plain" \
  -d '<WEBHOOK_SECRET>, buy, MNQ, 5, 2026-02-12T10:30:00Z, 21000.50, 21010.25, 21015.00, 20995.00, 5000, 1'
\`\`\`

**Test 5 — Minimal payload (no OHLCV):**
\`\`\`bash
curl -X POST https://topstep-bot-50.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<WEBHOOK_SECRET>",
    "ticker": "ES",
    "action": "buy",
    "quantity": 1
  }'
\`\`\`
**Expected:** price = null, raw_payload has no OHLCV fields.

### Phase 2: Negative Tests (should reject)

| Test | Payload | Expected |
|---|---|---|
| Wrong secret | `"secret": "wrong"` | 401 Unauthorized |
| Missing action | No `action` field | 400 Validation failed |
| Invalid action | `"action": "hold"` | 400 Invalid action |
| Missing ticker | No `ticker`/`symbol` | 400 Validation failed |
| GET request | `GET /api/webhook` | 405 Method not allowed |

### Phase 3: GET /api/alerts Validation

After inserting test alerts, verify:

- [ ] `GET /api/alerts` returns all inserted alerts with correct pagination
- [ ] `GET /api/alerts?symbol=ES` filters correctly
- [ ] `GET /api/alerts?action=buy` filters correctly
- [ ] `GET /api/alerts?status=received` filters correctly
- [ ] `GET /api/alerts?sort=created_at&order=asc` sorts correctly
- [ ] `GET /api/alerts/[id]` returns full alert with OHLCV extracted from raw_payload

### Phase 4: Dashboard Verification

Open https://topstep-bot-50.vercel.app and verify:

- [ ] Alerts table shows all test alerts
- [ ] Columns display: Time, Symbol, Action, Qty, Price, Status
- [ ] Price column shows the open price (mapped from webhook `open` field)
- [ ] Clicking an alert row expands to show AlertDetailPanel
- [ ] OHLCV data (O/H/L/C/V) renders correctly in the detail panel
- [ ] Interval shows in detail panel
- [ ] Status badge shows "received"
- [ ] Realtime: send a new curl webhook and confirm the alert appears in the table WITHOUT refreshing

### Phase 5: Schema & Code Alignment Audit

Verify no orphaned code or schema drift:

- [ ] **DB columns vs Insert**: All columns in `supabase/migrations/20260212000000_create_alerts_table.sql` are represented in `src/types/database.ts` (AlertInsert, AlertRow)
- [ ] **alert-storage.ts**: Every field written matches a real DB column
- [ ] **raw_payload**: Contains all TradingView data (open, high, low, close, volume, interval, alertTime)
- [ ] **price mapping**: `price` column = `open` from TradingView when no explicit price provided
- [ ] **api/alerts/[id].ts**: Extracts OHLCV from `raw_payload` correctly
- [ ] **Dashboard AlertsTable**: `extractOHLCV()` reads from `raw_payload` fields correctly
- [ ] **Orphaned Neon code**: `src/lib/db.ts` is only used by `src/lib/migrate.ts` — confirm no API routes import it
- [ ] **Old migration**: `migrations/001_create_alerts_table.sql` has a different schema than the actual Supabase table — should be removed or marked as deprecated
- [ ] **RLS policies**: Service role can INSERT (webhook), anon can SELECT (dashboard)
- [ ] **Realtime publication**: `alerts` table is in `supabase_realtime` publication

## Acceptance Criteria

- [ ] All 5 positive webhook tests return `{"success": true}` with an `alertId`
- [ ] All negative tests return appropriate error codes
- [ ] All alerts appear in `GET /api/alerts` with correct field values
- [ ] Dashboard renders all alerts with correct OHLCV data
- [ ] Realtime subscription delivers new alerts without page refresh
- [ ] No schema mismatches between DB, TypeScript types, API, and dashboard
- [ ] No orphaned/dead code paths

## Notes

- Replace `<WEBHOOK_SECRET>` with the actual value from Vercel env vars
- The `price` column now maps to the TradingView `open` price when no explicit `price` is provided
- The `@neondatabase/serverless` package is still in dependencies for the migrate script but is no longer used by API routes

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/6
- Created: 2026-02-12 07:40:16+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #6*
