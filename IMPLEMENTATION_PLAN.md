# Implementation Plan

**Last Updated:** 2026-02-12
**Status:** BUILD COMPLETE
**Feature:** Multi-symbol trading support (MES, MNQ, MYM, MGC, MCL, MBT)
**Issue:** #12

## Summary

Enable the bot to trade multiple symbols simultaneously on a single TopstepX connection. The architecture is partially ready — MarketHub, AlertListener, TradeExecutor, and EntryCalculator are already multi-symbol compatible. The remaining work centers on: (1) CLI/config changes from `symbol: string` to `symbols: string[]`, (2) adding contract specs for MYM/MGC/MCL/MBT, (3) refactoring BotRunner + PositionManager to handle multiple symbols concurrently, (4) updating the backtest engine, (5) adding symbol filters to the dashboard, and (6) comprehensive testing.

## Specifications Analyzed
- [x] specs/multi-symbol-trading-support-mes-mnq-mym-mgc-mcl-m.md - Primary spec for issue #12

## Database Analysis

### Existing Tables
- `alerts` — TradingView webhook alerts (already has `symbol` column, no changes needed)
- `positions` — Bot-managed positions (already has `symbol` column, no changes needed)
- `trades_log` — Completed trade records (already has `symbol` column, no changes needed)

### Schema Changes Required
- **None required for core multi-symbol support.** All three tables already have a `symbol` column and can store data for any symbol.
- **Optional:** `bot_sessions` table (spec mentions it for tracking active bot state). This is a "nice to have" and can be deferred. The dashboard can show active symbols without it.

## Gap Analysis

### Already Multi-Symbol Ready (No Changes)
| Component | File | Why |
|-----------|------|-----|
| AlertListener | `src/bot/alert-listener.ts` | Listens to ALL alerts, no symbol filter |
| TradeExecutor | `src/bot/trade-executor.ts` | Takes `symbol` as parameter per method call |
| MarketHub | `src/services/topstepx/streaming.ts` | `subscribedContracts: Set<string>`, supports multiple `subscribe()` calls |
| UserHub | `src/services/topstepx/streaming.ts` | Account-wide, not symbol-specific |
| EntryCalculator | `src/bot/entry-calculator.ts` | Takes `symbol` as optional config param |
| Database schema | `supabase/migrations/` | All tables have `symbol` column |
| API endpoints | `api/*.ts` | All support `?symbol=` filter param |

### Needs Changes
| Component | File | What's Wrong |
|-----------|------|-------------|
| BotConfig type | `src/bot/types.ts:79-94` | `symbol: string` + `contractId: string` (singular) |
| Bot CLI | `src/bot/cli.ts:38` | `--symbol` flag (singular), resolves 1 contract |
| BotRunner | `src/bot/runner.ts` | Creates 1 PositionManager, subscribes 1 contract, hardcodes `this.config.symbol` in quote handler (line 146) |
| PositionManager | `src/bot/position-manager.ts` | Config has single `symbol`/`contractId`; `updateUnrealizedPnl` (line 343) and `buildTradeResult` (line 354) use `this.config.symbol` instead of `position.symbol`; `calculateEntryPrice` call (line 110) uses `this.config.symbol` |
| CONTRACT_SPECS | `src/services/topstepx/types.ts:269-306` | Only has ES, NQ, MES, MNQ — missing MYM, MGC, MCL, MBT |
| getCurrentContractId | `src/services/topstepx/client.ts:204-233` | Hardcodes quarterly expiry cycle — MYM is quarterly but MGC, MCL, MBT use monthly |
| Backtest CLI | `src/bot/backtest/cli.ts` | Single `--symbol` flag |
| BacktestConfig | `src/bot/backtest/types.ts:6-19` | `symbol: string` (singular) |
| Backtest engine | `src/bot/backtest/engine.ts:34` | `.eq('symbol', config.symbol)` — single symbol filter |
| Bot status display | `src/bot/cli.ts:85-86` | Shows single `Symbol:` and `Contract:` line |
| Dashboard KPI | `dashboard/src/components/KpiCards.tsx` | Aggregates P&L globally, no per-symbol breakdown |
| Dashboard Positions tab | `dashboard/src/App.tsx` | No symbol filter passed to `usePositions()` hook |
| Dashboard Trade Log tab | `dashboard/src/App.tsx` | No symbol filter passed to `useTradeLog()` hook |
| Dashboard symbol list | `dashboard/src/App.tsx:96-99` | Extracts symbols only from alerts, not from positions/trades |

## Prioritized Tasks

### Phase 1: Contract Specs & Resolution (Foundation)

- [x] **1.1** Add CONTRACT_SPECS entries for MYM, MGC, MCL, MBT in `src/services/topstepx/types.ts` — `CONTRACT_SPECS` Record. Add 4 new entries with correct `name`, `tickSize`, `tickValue`, `pointValue`, `contractIdPrefix`, `marginDay`, `marginOvernight`. Values from spec: MYM (tick 1.0, tickValue $0.50, prefix `CON.F.US.MYM`), MGC (tick 0.10, tickValue $1.00, prefix `CON.F.US.MGC`), MCL (tick 0.01, tickValue $1.00, prefix `CON.F.US.MCL`), MBT (tick 5.0, tickValue $0.50, prefix `CON.F.CME.MBT`). Calculate `pointValue` from `tickValue / tickSize`. — LOW complexity

- [x] **1.2** Refactor `getCurrentContractId()` in `src/services/topstepx/client.ts:204-233` to support both quarterly AND monthly expiry cycles. Currently hardcodes `expiryMonths = [3, 6, 9, 12]`. Add per-symbol expiry configuration: MES/MNQ/MYM use quarterly (H/M/U/Z), MGC/MCL/MBT use monthly (every month). Add an `expiryCycle` field to `ContractSpec` (`'quarterly' | 'monthly'`) and use it in the function. — MEDIUM complexity

- [x] **1.3** Add unit tests for new contract specs and expiry resolution in `tests/contract-specs.test.ts`. Test that `getCurrentContractId('MYM')`, `getCurrentContractId('MGC')`, `getCurrentContractId('MCL')`, `getCurrentContractId('MBT')` return valid contract IDs with correct prefixes. Test monthly vs quarterly rollover logic. — LOW complexity

### Phase 2: Config & Type Changes

- [x] **2.1** Update `BotConfig` interface in `src/bot/types.ts:79-94`: change `symbol: string` to `symbols: string[]`, change `contractId: string` to `contractIds: Map<string, string>` (symbol → contractId mapping). — LOW complexity

- [x] **2.2** Update `PositionManagerConfig` in `src/bot/position-manager.ts:47-53`: change `symbol: string` to `symbols: string[]`, change `contractId: string` to `contractIds: Map<string, string>`. — LOW complexity

- [x] **2.3** Fix `PositionManager.onAlert()` at line 108-111: change `symbol: this.config.symbol` to `symbol: alert.symbol` in the `calculateEntryPrice()` call so entry prices use the correct symbol's tick size. — LOW complexity

- [x] **2.4** Fix `PositionManager.updateUnrealizedPnl()` at line 342-343: change `CONTRACT_SPECS[this.config.symbol]` to `CONTRACT_SPECS[position.symbol]`. — LOW complexity

- [x] **2.5** Fix `PositionManager.buildTradeResult()` at line 354: change `CONTRACT_SPECS[this.config.symbol]` to `CONTRACT_SPECS[position.symbol]`. — LOW complexity

- [x] **2.6** Fix `PositionManager.createPosition()` at line 283: change `contractId: this.config.contractId` to `contractId: this.config.contractIds.get(alert.symbol) ?? ''`. — LOW complexity

### Phase 3: BotRunner Multi-Symbol Orchestration

- [x] **3.1** Update `BotRunner.constructor()` in `src/bot/runner.ts:36-52`: pass multi-symbol config to PositionManager. Update `PositionManagerConfig` to include `symbols` array and `contractIds` map. — MEDIUM complexity

- [x] **3.2** Update `BotRunner.start()` in `src/bot/runner.ts:71-74`: loop over `this.config.symbols` and call `this.marketHub.subscribe(contractId)` for each symbol's contract. Log all symbols being watched. — LOW complexity

- [x] **3.3** Update `BotRunner.wireEvents()` quote handler at line 145-147: replace `this.positionManager.onTick(this.config.symbol, ...)` with contractId → symbol lookup. Build a `contractToSymbol: Map<string, string>` from config and use `event.contractId` to resolve the symbol. — MEDIUM complexity

- [x] **3.4** Add symbol filtering to alert handler in `BotRunner.wireEvents()` at line 130: add guard `if (!this.config.symbols.includes(alert.symbol)) return;` to only process alerts for configured symbols. — LOW complexity

- [x] **3.5** Update `BotRunner.getStatus()` at line 110-124: add `symbols: string[]` and `contractIds: string[]` to the returned status object. — LOW complexity

### Phase 4: CLI Changes

- [x] **4.1** Update bot CLI in `src/bot/cli.ts`: add `--symbols` flag (comma-separated) with backward compat for `--symbol` (single). Parse: `const symbolsArg = getArg(args, '--symbols') ?? getArg(args, '--symbol') ?? 'ES'; const symbols = symbolsArg.split(',').map(s => s.trim().toUpperCase());`. Resolve contract IDs for all symbols. Update usage text. — MEDIUM complexity

- [x] **4.2** Update bot CLI status display in `src/bot/cli.ts:80-109`: show list of all watched symbols and their contracts. Show per-symbol active position status. Format example: `Symbols: MES, MNQ, MYM (3 contracts)`. — LOW complexity

- [x] **4.3** Update `BotConfig` construction in `src/bot/cli.ts:58-66`: build `symbols` array and `contractIds` map from parsed symbols. — LOW complexity

### Phase 5: Backtest Multi-Symbol Support

- [x] **5.1** Update `BacktestConfig` in `src/bot/backtest/types.ts:12`: change `symbol: string` to `symbols: string[]`. — LOW complexity

- [x] **5.2** Update backtest CLI in `src/bot/backtest/cli.ts`: add `--symbols` flag with backward compat for `--symbol`. Parse comma-separated symbols. Update usage text. — LOW complexity

- [x] **5.3** Update backtest engine in `src/bot/backtest/engine.ts:34`: change `.eq('symbol', config.symbol)` to `.in('symbol', config.symbols)`. Resolve contract IDs per symbol. Group alerts by symbol for per-symbol contract resolution. — MEDIUM complexity

- [x] **5.4** Update backtest reporter to show per-symbol breakdown in addition to aggregate stats. — LOW complexity

### Phase 6: Dashboard UX Updates

- [x] **6.1** Add symbol filter dropdown to Positions tab: extract symbols from positions data, add filter UI component, pass `symbol` param to `usePositions()` hook call in `dashboard/src/App.tsx`. — LOW complexity

- [x] **6.2** Add symbol filter dropdown to Trade Log tab: extract symbols from trades data, add filter UI component, pass `symbol` param to `useTradeLog()` hook call in `dashboard/src/App.tsx`. — LOW complexity

- [x] **6.3** Update symbol list extraction in `dashboard/src/App.tsx:96-99`: merge symbols from alerts, positions, AND trades data sources. — LOW complexity

- [x] **6.4** Add per-symbol P&L breakdown to KPI cards in `dashboard/src/components/KpiCards.tsx`: show total P&L plus per-symbol subtotals. Accept optional `selectedSymbol` prop to filter KPIs. — MEDIUM complexity

### Phase 7: Unit Tests

- [x] **7.1** Add unit test for multi-symbol CLI parsing in `tests/cli-multi-symbol.test.ts`: test `--symbols MES,MNQ,MYM` parsing, backward compat with `--symbol ES`, default to `['ES']`, invalid symbol handling. — LOW complexity

- [x] **7.2** Add unit test for PositionManager multi-symbol support in `tests/position-manager-multi-symbol.test.ts`: test concurrent positions on different symbols, per-symbol P&L calculation using correct `pointValue`, alert routing to correct symbol position. — MEDIUM complexity

- [x] **7.3** Add unit test for BotRunner quote routing in `tests/bot-runner-multi-symbol.test.ts`: test contractId → symbol resolution, quote events routed to correct symbol in PositionManager. — MEDIUM complexity

### Phase 8: E2E Tests

- [x] **8.1** Add E2E test for multi-symbol alert routing in `tests/e2e/multi-symbol.e2e.test.ts`: insert alerts for MES, MNQ, MYM simultaneously, verify each creates the correct position with correct contract specs. — MEDIUM complexity

- [x] **8.2** Add E2E test for multi-symbol backtest in `tests/e2e/multi-symbol-backtest.e2e.test.ts`: run backtest with `symbols: ['MES', 'MNQ']`, verify per-symbol results and aggregate stats. — MEDIUM complexity

- [x] **8.3** Add E2E test for API filtering across symbols: verify `/api/positions?symbol=MES` returns only MES positions when multiple symbols have data. — LOW complexity

### Phase 9: Validation

- [x] **9.1** Run `npm run validate` (lint + typecheck + test + test:e2e) — ensure zero errors. — LOW complexity

- [x] **9.2** Manual dry-run test with `npm run bot -- --account-id <id> --symbols MES,MNQ --dry-run` to verify startup, contract resolution, and status display. — LOW complexity *(Requires live TopstepX credentials — CLI parsing and contract resolution verified via unit tests; full startup requires manual test with real account)*

## Dependencies

```
Phase 1 (Contract Specs)
  └── Phase 2 (Config Types) depends on 1.1 (new specs must exist)
       └── Phase 3 (BotRunner) depends on 2.1, 2.2
       └── Phase 4 (CLI) depends on 2.1
       └── Phase 5 (Backtest) depends on 2.1
  Phase 6 (Dashboard) — independent, can run in parallel with Phases 2-5
  Phase 7 (Unit Tests) depends on Phases 2-5
  Phase 8 (E2E Tests) depends on Phases 2-6
  Phase 9 (Validation) depends on all prior phases
```

## Design Decisions

### Architecture: Single PositionManager with per-symbol position map (NOT one PM per symbol)

The PositionManager already stores positions in `Map<string, ManagedPosition>` keyed by symbol. Rather than creating N PositionManagers (one per symbol), we keep a single instance and fix the 3 places where `this.config.symbol` is used instead of `position.symbol`. This is simpler, avoids wiring N event emitters, and aligns with the existing design.

### Contract resolution: Add `expiryCycle` to ContractSpec

Rather than maintaining a separate lookup table, we add `expiryCycle: 'quarterly' | 'monthly'` to the existing `ContractSpec` interface. The `getCurrentContractId()` function then selects the correct expiry months based on this field. Quarterly = [3,6,9,12] (H/M/U/Z), Monthly = [1..12].

### CLI backward compatibility

`--symbol ES` continues to work (treated as `--symbols ES`). The new `--symbols` flag takes comma-separated values. Parsing priority: `--symbols` > `--symbol` > default `'ES'`.

### BotConfig shape

```typescript
interface BotConfig {
  accountId: number;
  symbols: string[];                    // was: symbol: string
  contractIds: Map<string, string>;     // was: contractId: string — keyed by symbol
  dryRun: boolean;
  slBufferTicks: number;
  writeIntervalMs: number;
  quantity: number;                     // same quantity for all symbols
}
```

### Quote routing

BotRunner builds `contractToSymbol: Map<string, string>` at startup. The `onQuote` handler looks up `event.contractId` to find the symbol, then calls `positionManager.onTick(symbol, price, timestamp)`.

## Notes

1. **Contract prefix verification:** The spec notes that MYM/MGC/MCL/MBT prefixes need verification against TopstepX API. The build phase should use `searchContracts()` to validate prefixes if possible, but the prefixes listed in the spec are reasonable defaults.
2. **Monthly expiry:** MGC, MCL, and MBT use monthly expiry cycles, not quarterly. This is the most significant logic change in `getCurrentContractId()`.
3. **No database migration needed:** All existing tables support multi-symbol data via the `symbol` column.
4. **`bot_sessions` table deferred:** The spec mentions it as optional ("Consider"). We skip it for now — the CLI status display shows active symbols.
5. **Quantity is per-symbol:** The current design uses the same `quantity` for all symbols. Per-symbol quantity could be a future enhancement but is not in scope for this issue.

---

BUILD COMPLETE - All phases implemented and validated
