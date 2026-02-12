# Dashboard does not display real-time data without manual page refresh

**Type:** Bug Fix
**GitHub Issue:** #8
**Labels:** none

## Overview

## Problem

The dashboard requires a full page refresh to show updated data. Relative timestamps freeze (e.g. "5s ago" never changes), new alerts don't appear, and KPI cards don't update — even though Supabase Realtime is partially wired up.

## Root Causes

### 1. Realtime invalidation doesn't trigger refetch
`useRealtimeAlerts.ts` calls `queryClient.invalidateQueries()` on Supabase events, which marks queries as stale but **does not refetch** them. The UI never updates because no re-render is triggered.

**Fix:** Use `queryClient.refetchQueries()` instead of `invalidateQueries()`, or chain `.then(() => refetchQueries(...))`.

### 2. Relative timestamps freeze after render
`formatRelativeTime()` in `AlertsTable.tsx` and `KpiCards.tsx` calculates the time difference once at render. Since nothing triggers a re-render, "5s ago" stays frozen forever.

**Fix:** Add a `useEffect` interval (every ~1s) that forces a re-render so relative timestamps stay accurate. A simple `useState` tick counter works cleanly.

### 3. No polling fallback
`useAlerts` and `useAlertDetail` hooks have no `refetchInterval` configured. If the Supabase Realtime WebSocket drops or misses an event, the UI has no way to recover.

**Fix:** Add `refetchInterval: 5000` (or similar) to `useAlerts` as a fallback polling strategy alongside realtime.

### 4. KPI success rate calculation bug
In `KpiCards.tsx`, `successRate` divides `executed` (filtered from current page) by `alerts.length` (current page size) instead of `pagination.total`. This gives incorrect percentages.

**Fix:** Use `pagination.total` as the denominator, or fetch aggregate stats from the API.

## Files to Modify

- `dashboard/src/hooks/useRealtimeAlerts.ts` — switch to `refetchQueries()`
- `dashboard/src/hooks/useAlerts.ts` — add `refetchInterval` polling fallback
- `dashboard/src/hooks/useAlertDetail.ts` — add `refetchInterval` for open detail panels
- `dashboard/src/components/AlertsTable.tsx` — add tick interval for relative timestamps
- `dashboard/src/components/KpiCards.tsx` — fix success rate math + add tick interval

## Acceptance Criteria

- [ ] New alerts appear in the table within ~1s without page refresh
- [ ] Relative timestamps ("5s ago", "2m ago") update live every second
- [ ] KPI cards (total alerts, last alert time, success rate) update in real-time
- [ ] Success rate calculation is mathematically correct
- [ ] If Supabase Realtime disconnects, polling keeps the UI reasonably fresh
- [ ] No unnecessary re-renders or performance regressions

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/8
- Created: 2026-02-12 09:30:27+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #8*
