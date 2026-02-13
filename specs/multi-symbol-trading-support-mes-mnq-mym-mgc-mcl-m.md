# Multi-symbol trading support (MES, MNQ, MYM, MGC, MCL, MBT)

**Type:** Feature
**GitHub Issue:** #12
**Labels:** none

## Overview

## Summary

Enable the bot to trade multiple symbols simultaneously on a single TopstepX connection, with full dashboard visibility. Currently the bot only accepts one `--symbol` flag and subscribes to a single contract. The architecture is ~90% ready — the WebSocket hubs, position manager, and alert listener already support multi-symbol. The remaining work is in the CLI/config layer, contract resolution, and dashboard UX.

## Motivation

- Trade multiple micro futures (MES, MNQ, MYM, MGC, MCL, MBT) from a single bot process
- TopstepX only allows limited concurrent connections — must multiplex on 2 WebSockets (1 User Hub + 1 Market Hub)
- Avoid running separate bot instances per symbol
- Dashboard must show positions and P&L across all symbols

## Requirements

### 1. CLI Multi-Symbol Flag
- Change `--symbol ES` (single) to `--symbols MES,MNQ,MYM,MGC,MCL,MBT` (comma-separated)
- Backward-compatible: `--symbol ES` still works for single symbol
- Symbols baked into the command at startup — no runtime changes needed

**Example:**
```bash
npm run bot -- --account-id 18206938 --symbols MES,MNQ,MYM,MGC,MCL,MBT --dry-run
```

### 2. BotConfig & Runner Changes
- `BotConfig.symbol: string` → `BotConfig.symbols: string[]`
- `BotRunner` resolves contract IDs for ALL symbols at startup
- Subscribes to all contract quote streams on the single Market Hub connection
- Logs which symbols are being watched on boot

### 3. Contract ID Resolution
- `getCurrentContractId()` already supports ES, NQ, MES, MNQ with proper prefixes
- **Needs adding:** MYM (Micro Dow), MGC (Micro Gold), MCL (Micro Crude), MBT (Micro Bitcoin)
- Each needs: contract prefix, tick size, tick value, point value, expiry cycle
- Contract specs to add:
  | Symbol | Name | Prefix | Tick Size | Tick Value | Expiry |
  |--------|------|--------|-----------|------------|--------|
  | MYM | Micro Dow | CON.F.US.MYM | 1.0 | $0.50 | Quarterly (H/M/U/Z) |
  | MGC | Micro Gold | CON.F.US.MGC | 0.10 | $1.00 | Monthly (G/J/M/Q/V/Z) |
  | MCL | Micro Crude | CON.F.US.MCL | 0.01 | $1.00 | Monthly |
  | MBT | Micro Bitcoin | CON.F.CME.MBT | 5.0 | $0.50 | Monthly |

  > **Note:** Contract prefixes and expiry cycles need verification against TopstepX API. Use `searchContracts()` to confirm before hardcoding.

### 4. Position Manager (Minimal Changes)
- Already uses `Map<string, ManagedPosition>` keyed by symbol ✅
- Already handles `onTick(symbol, price, timestamp)` per symbol ✅
- Constructor currently takes single symbol — update to accept `symbols: string[]`
- Allow one active position per symbol (not one total)

### 5. Alert Listener (No Changes Needed)
- Already listens to ALL alerts with no symbol filter ✅
- Routes to PositionManager which handles by symbol ✅

### 6. Market Hub (No Changes Needed)
- Already supports `subscribe(contractId)` per symbol ✅
- Already tracks `subscribedContracts: Set<string>` ✅
- Already re-subscribes on reconnect ✅

### 7. Dashboard UX Updates

The dashboard reads from Supabase — no direct connection to the local bot needed. Data flows: **Bot → Supabase → Dashboard**.

Updates needed:
- **KPI Cards:** Aggregate P&L across all symbols, or add per-symbol breakdown
- **Positions Tab:** Already shows symbol column — works as-is, but consider adding a symbol filter dropdown
- **Alerts Tab:** Already has symbol filter ✅
- **Trade Log Tab:** Already has symbol filter ✅
- **New: Active Symbols indicator** — show which symbols the bot is currently watching (could read from a `bot_status` table or config endpoint)

### 8. Supabase Writer (Minimal Changes)
- Already writes positions by symbol — no structural change needed
- May want to add a `bot_sessions` table to track which symbols are active:
  ```sql
  CREATE TABLE bot_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    symbols TEXT[] NOT NULL,
    account_id INTEGER NOT NULL,
    status TEXT DEFAULT 'running',
    last_heartbeat TIMESTAMPTZ DEFAULT NOW()
  );
  ```

## Architecture Diagram

```
TradingView Alerts (any symbol)
        ↓
    POST /api/webhook (Vercel)
        ↓
    Supabase alerts table
        ↓ (Realtime subscription)
    Local Bot (single process)
        ├── Alert Listener (all symbols)
        ├── Position Manager (Map<symbol, position>)
        ├── Market Hub (1 WebSocket, N subscriptions)
        │     ├── subscribe(MES contract)
        │     ├── subscribe(MNQ contract)
        │     ├── subscribe(MYM contract)
        │     ├── subscribe(MGC contract)
        │     ├── subscribe(MCL contract)
        │     └── subscribe(MBT contract)
        └── User Hub (1 WebSocket, all order/position events)
        ↓
    Supabase positions + trades_log tables
        ↓ (Realtime subscription)
    Dashboard on Vercel (read-only)
```

## Implementation Checklist

- [ ] Update CLI to accept `--symbols` flag (comma-separated)
- [ ] Update `BotConfig` type: `symbol` → `symbols: string[]`
- [ ] Add contract specs for MYM, MGC, MCL, MBT (verify via `searchContracts()`)
- [ ] Update `BotRunner` to resolve and subscribe to multiple contract IDs
- [ ] Update `PositionManager` constructor to accept symbol array
- [ ] Update bot startup logs to show all watched symbols
- [ ] Add symbol filter dropdown to Positions tab in dashboard
- [ ] Consider `bot_sessions` table for tracking active bot state
- [ ] Test with `--dry-run` across all 6 symbols
- [ ] Update bot terminal UI to show all active positions across symbols
- [ ] Add E2E test for multi-symbol alert routing

## Risk & Considerations

1. **Connection limits:** Verify TopstepX allows subscribing to 6+ contracts on one Market Hub connection
2. **Rate limits:** More symbols = more order API calls. Check TopstepX rate limits.
3. **Memory:** Each active position + quote stream adds memory. Should be minimal for 6 symbols.
4. **Commodities expiry:** Gold, Crude, Bitcoin use monthly expiry cycles, not quarterly like index futures. Contract ID resolver needs different logic per symbol.
5. **VPVR accuracy:** VPVR calculations depend on volume data quality. Micro contracts may have less volume than full-size — confirmation scores may vary.

## Labels

enhancement, trading, priority:high

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/12
- Created: 2026-02-13 03:53:27+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #12*
