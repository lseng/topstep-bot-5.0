# Support TradingView `any alert() function call` webhooks — separate endpoints for sfx-algo and informational

**Type:** Feature
**GitHub Issue:** #24
**Labels:** feature

## Overview

# Support TradingView `any alert() function call` Webhooks

**Type:** Feature
**Labels:** webhook, data-pipeline, dashboard

## Feature Description

Add two new standalone webhook endpoints to capture raw TradingView payloads from Pine Script `any alert() function call` triggers. These alerts have Pine Script-controlled bodies — we cannot inject our secret or structured fields. The goal is pure raw data capture for a full trading day so we can analyze real payloads before designing structured schemas.

**Two separate webhooks, two separate tables, zero changes to existing code.**

### Webhook 1: SFX Algo (`/api/webhook/sfx-algo`)
Trade signals from day trader strategies (S1/S2 buy/sell, TP hits, SL hits, etc.)
- `day-trader-long-term-AI-any-alert()-function-call` — S2 signals
- `day-trader-medium-term-13-any-alert()-function-call` — S1 signals

### Webhook 2: Informational (`/api/webhook/informational`)
Chart indicator events (market structure, not trade signals)
- `price-action-toolkit-any-alert()-function-call` — SMC/ICT events (BOS, CHoCH, FVG, OB, etc.)

**Tickers:** ES1!, NQ1!, MES1!, MNQ1!, YM1!, MYM1!, MGC1!, CL1!, MNG!, MBT1!

**TradingView webhook URLs:**
```
https://<vercel-domain>/api/webhook/sfx-algo?secret=<WEBHOOK_SECRET>
https://<vercel-domain>/api/webhook/informational?secret=<WEBHOOK_SECRET>
```

## User Story

As a **trader using TradingView Pine Script indicators**
I want to **capture all raw webhook payloads from my `any alert() function call` alerts into separate tables**
So that **I can analyze a full day of real payload data and then design proper structured schemas to make my bot smarter with all signal types combined**

## Problem Statement

Current webhook handler (`api/webhook.ts`) requires the `secret` field inside the JSON body. TradingView's `any alert() function call` trigger sends whatever the Pine Script `alert()` function emits — we have no control over the body format. We need separate endpoints that authenticate via query parameter and store raw payloads. The existing webhook must not be touched.

## Solution Overview

1. **Two new endpoints** — `POST /api/webhook/sfx-algo` and `POST /api/webhook/informational` (existing `api/webhook.ts` untouched)
2. **Auth via `?secret=` query param** — since body is Pine-controlled
3. **Two new tables** — `sfx_algo_alerts` for trade signals, `informational_events` for chart indicators
4. **Minimal schema** — `id`, `created_at`, `source`, `raw_body`, `content_type` only. No parsing, no structured columns.
5. **Dashboard tabs** — view raw data as it comes in
6. **Zero changes to existing code** — `api/webhook.ts`, `alerts` table, and all existing tests untouched

---

## ADW Configuration

### Command
```
/feature
```

### Agents
- **Plan**: Use `/ralph plan` with unlimited iterations
- **Build**: Use `/ralph build` with unlimited iterations
- **Test**: Use `/test` to run full validation suite

### Database Impact
- [x] Creates new table(s): `sfx_algo_alerts`, `informational_events`
- [ ] Modifies existing table(s)
- [ ] No database changes

### Existing Schema to Reuse
- `Database` interface in `src/types/database.ts` — add both tables following exact same Row/Insert/Update pattern
- Helper type exports pattern (e.g. `SfxAlgoAlertRow`, `InformationalEventRow`)
- No FK references to existing tables — these are fully independent

### Affected Components
- [x] `api/webhook/sfx-algo.ts` — **New** POST endpoint
- [x] `api/webhook/informational.ts` — **New** POST endpoint
- [x] `api/sfx-algo-alerts.ts` — **New** GET endpoint with pagination
- [x] `api/informational-events.ts` — **New** GET endpoint with pagination
- [x] `src/services/raw-webhook-storage.ts` — **New** shared storage service for both tables
- [x] `src/types/database.ts` — Add both table types
- [x] `src/types/index.ts` — Add response types
- [x] `supabase/migrations/20260215000000_create_sfx_algo_alerts_table.sql` — **New**
- [x] `supabase/migrations/20260215000001_create_informational_events_table.sql` — **New**
- [x] `dashboard/src/App.tsx` — Add "SFX Algo" and "Informational" tabs
- [x] `dashboard/src/components/RawEventsTable.tsx` — **New** shared table component (reused by both tabs)
- [x] `dashboard/src/hooks/useSfxAlgoAlerts.ts` — **New** React Query hook
- [x] `dashboard/src/hooks/useInformationalEvents.ts` — **New** React Query hook
- [x] `dashboard/src/hooks/useRealtimeSfxAlgo.ts` — **New** realtime subscription
- [x] `dashboard/src/hooks/useRealtimeInformational.ts` — **New** realtime subscription
- [x] `tests/raw-webhook-storage.test.ts` — **New** unit tests
- [x] `tests/webhook-sfx-algo.test.ts` — **New** unit tests
- [x] `tests/webhook-informational.test.ts` — **New** unit tests
- [x] `tests/e2e/webhook-sfx-algo.e2e.test.ts` — **New** e2e tests
- [x] `tests/e2e/webhook-informational.e2e.test.ts` — **New** e2e tests
- [x] `tests/e2e/sfx-algo-alerts-api.e2e.test.ts` — **New** e2e tests
- [x] `tests/e2e/informational-events-api.e2e.test.ts` — **New** e2e tests

**NOT modified (critical):**
- `api/webhook.ts` — existing webhook handler unchanged
- `src/services/alert-storage.ts` — existing alert storage unchanged
- `tests/webhook.test.ts` — existing webhook tests unchanged
- `tests/e2e/webhook.e2e.test.ts` — existing e2e tests unchanged

---

## Technical Requirements

### Database Changes

**Migration 1:** `supabase/migrations/20260215000000_create_sfx_algo_alerts_table.sql`

```sql
CREATE TABLE sfx_algo_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT,                -- which TradingView alert sent this (from query param or hardcoded)
  raw_body TEXT NOT NULL,     -- verbatim request body
  content_type TEXT           -- request Content-Type header
);

CREATE INDEX idx_sfx_algo_alerts_created_at ON sfx_algo_alerts(created_at DESC);

ALTER TABLE sfx_algo_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON sfx_algo_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow service insert" ON sfx_algo_alerts FOR INSERT TO service_role WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE sfx_algo_alerts;
```

**Migration 2:** `supabase/migrations/20260215000001_create_informational_events_table.sql`

```sql
CREATE TABLE informational_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT,                -- which TradingView alert sent this
  raw_body TEXT NOT NULL,     -- verbatim request body
  content_type TEXT           -- request Content-Type header
);

CREATE INDEX idx_informational_events_created_at ON informational_events(created_at DESC);

ALTER TABLE informational_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON informational_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow service insert" ON informational_events FOR INSERT TO service_role WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE informational_events;
```

### Type Definitions

**In `src/types/database.ts`** — Add to `Database.public.Tables`:

```typescript
sfx_algo_alerts: {
  Row: {
    id: string;
    created_at: string;
    source: string | null;
    raw_body: string;
    content_type: string | null;
  };
  Insert: {
    id?: string;
    created_at?: string;
    source?: string | null;
    raw_body: string;
    content_type?: string | null;
  };
  Update: {
    id?: string;
    created_at?: string;
    source?: string | null;
    raw_body?: string;
    content_type?: string | null;
  };
};
informational_events: {
  Row: {
    id: string;
    created_at: string;
    source: string | null;
    raw_body: string;
    content_type: string | null;
  };
  Insert: {
    id?: string;
    created_at?: string;
    source?: string | null;
    raw_body: string;
    content_type?: string | null;
  };
  Update: {
    id?: string;
    created_at?: string;
    source?: string | null;
    raw_body?: string;
    content_type?: string | null;
  };
};
```

Add helper exports:
```typescript
export type SfxAlgoAlertRow = Database['public']['Tables']['sfx_algo_alerts']['Row'];
export type SfxAlgoAlertInsert = Database['public']['Tables']['sfx_algo_alerts']['Insert'];

export type InformationalEventRow = Database['public']['Tables']['informational_events']['Row'];
export type InformationalEventInsert = Database['public']['Tables']['informational_events']['Insert'];
```

**In `src/types/index.ts`** — Add:
```typescript
export interface SfxAlgoAlertsResponse {
  success: true;
  data: import('./database').SfxAlgoAlertRow[];
  pagination: PaginationMeta;
}

export interface InformationalEventsResponse {
  success: true;
  data: import('./database').InformationalEventRow[];
  pagination: PaginationMeta;
}
```

### API Changes

#### New: `POST /api/webhook/sfx-algo`

Standalone handler (does NOT import from or modify `api/webhook.ts`):
1. Only accept POST
2. Validate `req.query.secret` via `validateWebhookSecret()`
3. Get raw body as string (handle both string and object body)
4. Insert into `sfx_algo_alerts` table: `{ source: 'sfx-algo', raw_body, content_type }`
5. Return `{ success: true, eventId: "<uuid>" }`

#### New: `POST /api/webhook/informational`

Same pattern as sfx-algo but inserts into `informational_events` table with `source: 'informational'`.

#### New: `GET /api/sfx-algo-alerts`

Follow exact pattern from `api/alerts.ts`. Query params:
- `page` (default 1), `limit` (default 25, max 100)
- `source` — filter by source
- `from`, `to` — date range on `created_at`
- `sort` (default `created_at`), `order` (default `desc`)

Valid sort columns: `created_at`, `source`.

#### New: `GET /api/informational-events`

Same pattern, reads from `informational_events` table.

### Service Layer

#### New: `src/services/raw-webhook-storage.ts`

Shared storage service used by both webhook handlers:

```typescript
export async function saveRawWebhook(
  table: 'sfx_algo_alerts' | 'informational_events',
  params: { source: string; rawBody: string; contentType: string | null }
): Promise<string>
```

Follow pattern from `src/services/alert-storage.ts`.

### Dashboard Changes

#### `dashboard/src/App.tsx`
- Add `'sfx-algo' | 'informational'` to `TabId` union type
- Add "SFX Algo" and "Informational" tab buttons
- Add tab content panels using shared `RawEventsTable` component
- Wire up hooks and pagination for each tab

#### New: `dashboard/src/components/RawEventsTable.tsx`
Shared table component used by both tabs. Follow `AlertsTable.tsx` pattern. Columns:
- Expand toggle (chevron)
- Time (`created_at`, sortable, 12h format)
- Source (text)
- Content Type (text, truncated)

Expanded row shows `raw_body` in a `<pre>` block with monospace font, word-wrap, and max-height with scroll.

#### New: `dashboard/src/hooks/useSfxAlgoAlerts.ts`
Follow `useAlerts.ts` pattern. Query key: `['sfx-algo-alerts', params]`. Endpoint: `/api/sfx-algo-alerts`.

#### New: `dashboard/src/hooks/useInformationalEvents.ts`
Follow `useAlerts.ts` pattern. Query key: `['informational-events', params]`. Endpoint: `/api/informational-events`.

#### New: `dashboard/src/hooks/useRealtimeSfxAlgo.ts`
Follow `useRealtimeAlerts.ts` pattern. Channel: `'sfx-algo-realtime'`. Table: `'sfx_algo_alerts'`. Invalidates `['sfx-algo-alerts']` query key on INSERT.

#### New: `dashboard/src/hooks/useRealtimeInformational.ts`
Follow `useRealtimeAlerts.ts` pattern. Channel: `'informational-realtime'`. Table: `'informational_events'`. Invalidates `['informational-events']` query key on INSERT.

---

## Acceptance Criteria

- [ ] `npm run validate` passes (lint + typecheck + test + test:e2e) with 0 warnings and 0 errors
- [ ] **Zero changes** to `api/webhook.ts`, `src/services/alert-storage.ts`, `tests/webhook.test.ts`, `tests/e2e/webhook.e2e.test.ts`
- [ ] `POST /api/webhook/sfx-algo?secret=<valid>` with any body content stores raw payload in `sfx_algo_alerts` and returns `{ success: true, eventId }`
- [ ] `POST /api/webhook/informational?secret=<valid>` with any body content stores raw payload in `informational_events` and returns `{ success: true, eventId }`
- [ ] Both webhooks return 401 for missing/invalid `?secret=`
- [ ] Both webhooks return 405 for non-POST methods
- [ ] `GET /api/sfx-algo-alerts` returns paginated results with date range filters
- [ ] `GET /api/informational-events` returns paginated results with date range filters
- [ ] Dashboard "SFX Algo" tab displays raw sfx-algo alerts with expandable body
- [ ] Dashboard "Informational" tab displays raw informational events with expandable body
- [ ] Both dashboard tabs receive real-time updates via Supabase Realtime
- [ ] All existing tests pass without modification (backward compatible)

## Testing Requirements

### Unit Tests

#### `tests/raw-webhook-storage.test.ts` (new)
- [ ] `saveRawWebhook` inserts into `sfx_algo_alerts` with correct fields and returns UUID
- [ ] `saveRawWebhook` inserts into `informational_events` with correct fields and returns UUID
- [ ] `saveRawWebhook` handles null content_type
- [ ] `saveRawWebhook` throws on database error

#### `tests/webhook-sfx-algo.test.ts` (new)
- [ ] Returns 405 for GET requests
- [ ] Returns 401 for missing `?secret=` query param
- [ ] Returns 401 for invalid `?secret=` query param
- [ ] Returns 200 and stores raw body for valid secret with text/plain body
- [ ] Returns 200 and stores raw body for valid secret with JSON body
- [ ] Returns 200 and stores raw body for valid secret with empty body (edge case)
- [ ] Response includes `eventId`

#### `tests/webhook-informational.test.ts` (new)
- [ ] Same test cases as sfx-algo but targeting informational endpoint and table

### E2E Tests

#### `tests/e2e/webhook-sfx-algo.e2e.test.ts` (new)
- [ ] Full flow: POST with valid secret → stored in sfx_algo_alerts → success response with eventId
- [ ] Auth rejection: POST without valid secret → 401
- [ ] Handles text/plain, application/json, and arbitrary content types
- [ ] Responds within 3 seconds

#### `tests/e2e/webhook-informational.e2e.test.ts` (new)
- [ ] Same test cases as sfx-algo but targeting informational endpoint and table

#### `tests/e2e/sfx-algo-alerts-api.e2e.test.ts` (new)
- [ ] GET returns paginated results
- [ ] Date range filter works
- [ ] Returns 405 for non-GET methods
- [ ] Returns 400 for invalid sort column

#### `tests/e2e/informational-events-api.e2e.test.ts` (new)
- [ ] Same test cases as sfx-algo-alerts-api

## Validation Commands
```bash
npm run lint        # ESLint with 0-warnings policy
npm run typecheck   # TypeScript strict check
npm run test        # Unit tests (Vitest)
npm run test:e2e    # End-to-end tests
npm run validate    # All of the above
```

## Implementation Notes

- **CRITICAL: Do not modify any existing files except `src/types/database.ts`, `src/types/index.ts`, and `dashboard/src/App.tsx`**. All other work is new files only. The existing webhook, storage, and test files must remain untouched.
- **Pattern files to follow**: Implementation should closely mirror existing patterns:
  - `api/webhook.ts` → pattern for new webhook handlers (but simpler — no parsing, no confirmation)
  - `src/services/alert-storage.ts` → pattern for `raw-webhook-storage.ts`
  - `api/alerts.ts` → pattern for GET endpoints
  - `dashboard/src/hooks/useAlerts.ts` → pattern for React Query hooks
  - `dashboard/src/hooks/useRealtimeAlerts.ts` → pattern for realtime subscriptions
  - `dashboard/src/components/AlertsTable.tsx` → pattern for `RawEventsTable.tsx`
- **No payload parsing**: Do NOT attempt to parse `raw_body` into structured fields. Store verbatim. We will analyze real payloads after a full trading day and design proper schemas in a follow-up issue.
- **Vercel query params**: `req.query.secret` may be `string | string[]`. Cast via `String()`.
- **Webhook handlers are simple**: ~30 lines each. Validate secret, grab body, store, respond. No CSV parsing, no OHLCV extraction, no confirmation engine.
- **Shared table component**: `RawEventsTable.tsx` is parameterized — same component renders both tabs, just different data prop.
- **Migration timestamps**: Use `20260215000000` and `20260215000001` to sort after existing migrations.

## References
- Related specs: none (new capability)
- Related issues: none
- Existing webhook handler (DO NOT MODIFY): `api/webhook.ts`
- Existing alerts API (pattern reference): `api/alerts.ts`

---

## Requirements

Based on the issue description above, implement the requested changes.

---
*This spec is ready for ADW ingestion via `/feature`*

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/24
- Created: 2026-02-15 08:51:45+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #24*
