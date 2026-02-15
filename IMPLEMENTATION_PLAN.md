# Implementation Plan

**Last Updated:** 2026-02-15
**Status:** COMPLETE
**Issue:** #24 — Support TradingView `any alert() function call` webhooks

## Summary

Add two new standalone webhook endpoints (`/api/webhook/sfx-algo` and `/api/webhook/informational`) to capture raw TradingView payloads from Pine Script `any alert() function call` triggers. Auth via `?secret=` query param (since Pine controls the body). Two new Supabase tables for raw storage. Dashboard tabs to view the data. Zero changes to existing webhook/alert code.

## Specifications Analyzed
- [x] specs/support-tradingview-any-alert-function-call-webhoo.md — Primary spec for this issue

## Database Analysis

### Existing Tables
| Table | Migration | Purpose |
|-------|-----------|---------|
| `alerts` | `20260212000000` | Structured TradingView webhook alerts |
| `positions` | `20260213000000`, `20260213100000` | Bot-managed trading positions |
| `trades_log` | `20260213000001`, `20260213100000` | Completed trade records |
| `bars_1m` | `20260214000000` | 1-minute OHLCV bar data |

### Schema Changes Required
Two new independent tables — no FKs to existing tables:

1. **`sfx_algo_alerts`** — Raw payloads from SFX Algo trade signal alerts
2. **`informational_events`** — Raw payloads from informational/indicator alerts

Both tables have identical schema: `id`, `created_at`, `source`, `raw_body`, `content_type`.

## Gap Analysis

| Component | Spec Requirement | Current State | Action |
|-----------|-----------------|---------------|--------|
| `sfx_algo_alerts` table | New table | Does not exist | Create migration |
| `informational_events` table | New table | Does not exist | Create migration |
| `POST /api/webhook/sfx-algo` | New endpoint | No `api/webhook/` directory | Create directory + handler |
| `POST /api/webhook/informational` | New endpoint | Does not exist | Create handler |
| `GET /api/sfx-algo-alerts` | New GET endpoint | Does not exist | Create handler |
| `GET /api/informational-events` | New GET endpoint | Does not exist | Create handler |
| `src/services/raw-webhook-storage.ts` | Shared storage service | Does not exist | Create service |
| `src/types/database.ts` | Add 2 table types | Missing `sfx_algo_alerts`, `informational_events` | Update existing file |
| `src/types/index.ts` | Add response types | Missing response types | Update existing file |
| Dashboard SFX Algo tab | New tab | Does not exist | Add to App.tsx |
| Dashboard Informational tab | New tab | Does not exist | Add to App.tsx |
| `RawEventsTable.tsx` | Shared table component | Does not exist | Create component |
| `useSfxAlgoAlerts.ts` | React Query hook | Does not exist | Create hook |
| `useInformationalEvents.ts` | React Query hook | Does not exist | Create hook |
| `useRealtimeSfxAlgo.ts` | Realtime subscription | Does not exist | Create hook |
| `useRealtimeInformational.ts` | Realtime subscription | Does not exist | Create hook |
| Unit tests (3 files) | New test files | Do not exist | Create tests |
| E2E tests (4 files) | New test files | Do not exist | Create tests |

**CRITICAL CONSTRAINTS:**
- `api/webhook.ts` — MUST NOT be modified
- `src/services/alert-storage.ts` — MUST NOT be modified
- `tests/webhook.test.ts` — MUST NOT be modified
- `tests/e2e/webhook.e2e.test.ts` — MUST NOT be modified

## Prioritized Tasks

### Phase 1: Database & Types (Foundation)

- [x] **1.1** Create migration `supabase/migrations/20260215000000_create_sfx_algo_alerts_table.sql` — Create `sfx_algo_alerts` table with `id`, `created_at`, `source`, `raw_body`, `content_type`, index on `created_at DESC`, RLS policies (anon read, service_role insert), add to `supabase_realtime` publication — LOW complexity
- [x] **1.2** Create migration `supabase/migrations/20260215000001_create_informational_events_table.sql` — Create `informational_events` table with identical schema/policies — LOW complexity
- [x] **1.3** Update `src/types/database.ts` — Add `sfx_algo_alerts` and `informational_events` to `Database.public.Tables` (Row/Insert/Update), add helper type exports (`SfxAlgoAlertRow`, `SfxAlgoAlertInsert`, `InformationalEventRow`, `InformationalEventInsert`) — LOW complexity
- [x] **1.4** Update `src/types/index.ts` — Add `SfxAlgoAlertsResponse` and `InformationalEventsResponse` interfaces with `PaginationMeta` — LOW complexity

### Phase 2: Service Layer

- [x] **2.1** Create `src/services/raw-webhook-storage.ts` — `saveRawWebhook(table, { source, rawBody, contentType })` function following `alert-storage.ts` pattern. Uses `getSupabase()` from `src/lib/supabase.ts`. Returns UUID. Throws on DB error — LOW complexity

### Phase 3: Webhook Endpoints

- [x] **3.1** Create directory `api/webhook/` — Required for Vercel nested route `/api/webhook/sfx-algo` — TRIVIAL
- [x] **3.2** Create `api/webhook/sfx-algo.ts` — Self-contained POST handler. Validates `req.query.secret` via `validateWebhookSecret()`. Gets raw body as string (handle string/object body). Inserts via `saveRawWebhook('sfx_algo_alerts', ...)`. Returns `{ success: true, eventId }`. Returns 401 for bad secret, 405 for non-POST. ~30 lines — LOW complexity
- [x] **3.3** Create `api/webhook/informational.ts` — Same pattern as sfx-algo but inserts into `informational_events` table with `source: 'informational'` — LOW complexity

**IMPORTANT Vercel consideration:** Creating `api/webhook/` directory alongside `api/webhook.ts` — Vercel supports this pattern. The file `api/webhook.ts` handles `POST /api/webhook`. Files inside `api/webhook/` handle sub-paths like `POST /api/webhook/sfx-algo`. No conflict.

### Phase 4: GET API Endpoints

- [x] **4.1** Create `api/sfx-algo-alerts.ts` — Self-contained GET handler following `api/alerts.ts` pattern. Query params: `page`, `limit`, `source`, `from`, `to`, `sort`, `order`. Valid sort columns: `created_at`, `source`. Returns paginated response — MEDIUM complexity
- [x] **4.2** Create `api/informational-events.ts` — Same pattern as sfx-algo-alerts but reads from `informational_events` table — MEDIUM complexity

### Phase 5: Dashboard

- [x] **5.1** Create `dashboard/src/hooks/useSfxAlgoAlerts.ts` — React Query hook following `useAlerts.ts` pattern. Query key: `['sfx-algo-alerts', params]`. Endpoint: `/api/sfx-algo-alerts`. Params: `page`, `limit`, `source`, `from`, `to`, `sort`, `order` — LOW complexity
- [x] **5.2** Create `dashboard/src/hooks/useInformationalEvents.ts` — Same pattern. Query key: `['informational-events', params]`. Endpoint: `/api/informational-events` — LOW complexity
- [x] **5.3** Create `dashboard/src/hooks/useRealtimeSfxAlgo.ts` — Following `useRealtimeAlerts.ts` pattern. Channel: `'sfx-algo-realtime'`. Table: `'sfx_algo_alerts'`. Invalidates `['sfx-algo-alerts']` on INSERT — LOW complexity
- [x] **5.4** Create `dashboard/src/hooks/useRealtimeInformational.ts` — Same pattern. Channel: `'informational-realtime'`. Table: `'informational_events'`. Invalidates `['informational-events']` on INSERT — LOW complexity
- [x] **5.5** Create `dashboard/src/components/RawEventsTable.tsx` — Shared table component for both tabs. Columns: expand toggle (chevron), Time (created_at, sortable, 12h format), Source (text), Content Type (text). Expanded row shows `raw_body` in `<pre>` block with monospace font, word-wrap, max-height scroll. Uses TanStack Table following `AlertsTable.tsx` pattern — MEDIUM complexity
- [x] **5.6** Update `dashboard/src/App.tsx` — Add `'sfx-algo' | 'informational'` to `TabId` union. Add tab buttons. Add tab state (page, limit, sorting) for each. Wire up hooks, `RawEventsTable`, and `Pagination` for each tab. Wire up realtime hooks — MEDIUM complexity

### Phase 6: Unit Tests

- [x] **6.1** Create `tests/raw-webhook-storage.test.ts` — Mock Supabase, test `saveRawWebhook` for both tables, null content_type handling, DB error throwing. Follow `src/services/alert-storage.test.ts` pattern — MEDIUM complexity
- [x] **6.2** Create `tests/webhook-sfx-algo.test.ts` — Mock logger, mock `saveRawWebhook`. Test: 405 for GET, 401 for missing/invalid secret, 200 for valid secret with text/plain body, 200 for JSON body, 200 for empty body, response includes eventId. Follow `tests/webhook.test.ts` pattern — MEDIUM complexity
- [x] **6.3** Create `tests/webhook-informational.test.ts` — Same test cases as sfx-algo but targeting informational endpoint and table — MEDIUM complexity

### Phase 7: E2E Tests

- [x] **7.1** Create `tests/e2e/webhook-sfx-algo.e2e.test.ts` — Full flow: POST with valid secret → stored → success response with eventId. Auth rejection. Handles text/plain, JSON, arbitrary content types. Response < 3 seconds. Follow `tests/e2e/webhook.e2e.test.ts` pattern — MEDIUM complexity
- [x] **7.2** Create `tests/e2e/webhook-informational.e2e.test.ts` — Same cases targeting informational endpoint — MEDIUM complexity
- [x] **7.3** Create `tests/e2e/sfx-algo-alerts-api.e2e.test.ts` — GET returns paginated results, date range filter works, 405 for non-GET, 400 for invalid sort column. Follow `tests/e2e/alerts-api.e2e.test.ts` pattern — MEDIUM complexity
- [x] **7.4** Create `tests/e2e/informational-events-api.e2e.test.ts` — Same cases for informational events — MEDIUM complexity

### Phase 8: Validation

- [x] **8.1** Run `npm run validate` — lint + typecheck + test + test:e2e with 0 warnings, 0 errors
- [x] **8.2** Verify `api/webhook.ts`, `src/services/alert-storage.ts`, `tests/webhook.test.ts`, `tests/e2e/webhook.e2e.test.ts` have NOT been modified (git diff check)

## Dependencies

```
Phase 1 (DB & Types) ──┐
                        ├── Phase 2 (Service) ──┐
                        │                       ├── Phase 3 (Webhook Endpoints)
                        │                       └── Phase 4 (GET Endpoints)
                        │
                        └── Phase 5 (Dashboard) ── depends on Phase 4 (GET endpoints)

Phase 2+3 ──── Phase 6 (Unit Tests)
Phase 2+3+4 ── Phase 7 (E2E Tests)

All phases ──── Phase 8 (Validation)
```

## Implementation Notes

1. **Vercel nested routes**: `api/webhook.ts` (existing) handles `/api/webhook`. New `api/webhook/sfx-algo.ts` handles `/api/webhook/sfx-algo`. Vercel resolves these independently — no conflict.

2. **Self-contained API handlers**: Per AGENTS.md, API functions in `api/*.ts` must be self-contained. The webhook handlers will import `validateWebhookSecret` from `src/lib/validation.ts` and `saveRawWebhook` from `src/services/raw-webhook-storage.ts`. This matches the pattern used by `api/webhook.ts` which also imports from `src/`.

3. **Query param auth**: `req.query.secret` may be `string | string[]` in Vercel. Use `String(req.query.secret)` to normalize.

4. **Raw body handling**: The body could arrive as a string (text/plain) or parsed object (JSON). Always store as string: `typeof req.body === 'string' ? req.body : JSON.stringify(req.body)`.

5. **No parsing**: Store `raw_body` verbatim. No CSV/JSON extraction. The point is to capture real payloads for analysis before designing structured schemas.

6. **Dashboard tab pattern**: Follow the exact state management pattern from existing tabs (page, limit, sorting state per tab). The `RawEventsTable` component is parameterized — same component used by both tabs with different data.

7. **Migration timestamps**: `20260215000000` and `20260215000001` to sort after the existing `20260214000000` bars_1m migration.

## Files Summary

### New Files (19)
| File | Type |
|------|------|
| `supabase/migrations/20260215000000_create_sfx_algo_alerts_table.sql` | Migration |
| `supabase/migrations/20260215000001_create_informational_events_table.sql` | Migration |
| `src/services/raw-webhook-storage.ts` | Service |
| `api/webhook/sfx-algo.ts` | API endpoint |
| `api/webhook/informational.ts` | API endpoint |
| `api/sfx-algo-alerts.ts` | API endpoint |
| `api/informational-events.ts` | API endpoint |
| `dashboard/src/hooks/useSfxAlgoAlerts.ts` | React hook |
| `dashboard/src/hooks/useInformationalEvents.ts` | React hook |
| `dashboard/src/hooks/useRealtimeSfxAlgo.ts` | React hook |
| `dashboard/src/hooks/useRealtimeInformational.ts` | React hook |
| `dashboard/src/components/RawEventsTable.tsx` | React component |
| `tests/raw-webhook-storage.test.ts` | Unit test |
| `tests/webhook-sfx-algo.test.ts` | Unit test |
| `tests/webhook-informational.test.ts` | Unit test |
| `tests/e2e/webhook-sfx-algo.e2e.test.ts` | E2E test |
| `tests/e2e/webhook-informational.e2e.test.ts` | E2E test |
| `tests/e2e/sfx-algo-alerts-api.e2e.test.ts` | E2E test |
| `tests/e2e/informational-events-api.e2e.test.ts` | E2E test |

### Modified Files (3)
| File | Change |
|------|--------|
| `src/types/database.ts` | Add 2 table types + helper exports |
| `src/types/index.ts` | Add 2 response interfaces |
| `dashboard/src/App.tsx` | Add 2 tabs + state + hooks |

### NOT Modified (4) — Critical Constraint
| File | Reason |
|------|--------|
| `api/webhook.ts` | Existing webhook handler must remain untouched |
| `src/services/alert-storage.ts` | Existing alert storage must remain untouched |
| `tests/webhook.test.ts` | Existing webhook tests must remain untouched |
| `tests/e2e/webhook.e2e.test.ts` | Existing e2e tests must remain untouched |

---

PLANNING COMPLETE - Ready for build mode
