# Implementation Plan

**Last Updated:** 2026-02-17
**Status:** COMPLETE
**Issue:** #26 — Bot Pipeline Reliability: Reconciliation, VPVR Fallback, Dead Code Cleanup

## Summary

Fix systemic bot reliability issues discovered during live trading on 2026-02-16. The bot placed real orders on TopstepX but immediately lost track of them due to: (1) position reconciliation force-closing positions when a dead API returned 404, (2) SFX alerts silently dropped when VPVR bars unavailable despite having their own TP/SL, (3) dead LLM analyzer code producing noise, (4) FK constraint mismatch between positions and sfx_algo_alerts tables.

## Prioritized Tasks

### Phase 1: Remove Position Reconciliation Polling

- [x] **1.1** Remove reconciliation from runner.ts — Delete `syncInterval` property, `reconcileAllPositions()`, `reconcilePositions()` methods, syncInterval setup in `start()`, cleanup in `stop()`. The UserHub WebSocket already provides real-time position events
- [x] **1.2** Remove `getPositions()` from `src/services/topstepx/client.ts` and barrel export
- [x] **1.3** Remove `syncIntervalMs` from `BotConfig` in `src/bot/types.ts`
- [x] **1.4** Remove `--sync-interval` arg parsing from `src/bot/cli.ts`
- [x] **1.5** Update tests: Remove getPositions mocks, syncIntervalMs configs, EOD Position Sync test blocks

### Phase 2: Make VPVR Optional for SFX Mode

- [x] **2.1** Update `src/bot/runner.ts` `handleNewAlert()` — Proceed when VPVR is null but sfxTpLevels exist
- [x] **2.2** Update `src/bot/position-manager.ts` `onAlert()` — Accept `VpvrResult | null`, SFX-only entry path
- [x] **2.3** Update `src/bot/position-manager.ts` `createPosition()` — Handle null vpvr

### Phase 3: Delete LLM Analyzer and Dead Code

- [x] **3.1** Delete `src/bot/llm-analyzer.ts` and `src/bot/llm-analyzer.test.ts`
- [x] **3.2** Remove `llmReasoning`, `llmConfidence` from `ManagedPosition` and `TradeResult`
- [x] **3.3** Remove `llm_reasoning`, `llm_confidence` writes from `src/bot/supabase-writer.ts`
- [x] **3.4** Remove llm-analyzer mocks from all test files
- [x] **3.5** Update `AGENTS.md` — Remove `llm-analyzer.ts` from file structure
- [x] **3.6** Remove llm columns from `src/types/database.ts` and DB migration

### Phase 4: Add alert_source Column

- [x] **4.1** Create migration `supabase/migrations/20260217000000_add_alert_source_column.sql`
- [x] **4.2** Update `src/types/database.ts` — Add `alert_source` to positions and trades_log
- [x] **4.3** Update `src/bot/types.ts` — Add `alertSource` to ManagedPosition and TradeResult
- [x] **4.4** Update `src/bot/supabase-writer.ts` — Set `alert_source` on writes
- [x] **4.5** Update `src/bot/backtest/simulator.ts` — Add `alertSource` to simulated positions

### Phase 5: Validation

- [x] **5.1** `npm run validate` — 557 unit + 206 e2e = 763 tests passing, 0 lint warnings, 0 type errors
- [x] **5.2** Verified no references to `getPositions`, `analyzeTrade`, `llm-analyzer`, `syncIntervalMs`, `llmReasoning`, `llmConfidence` remain in src/ or tests/
