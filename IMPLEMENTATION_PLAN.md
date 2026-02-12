# Implementation Plan

**Last Updated:** 2026-02-11T17:07:00Z
**Status:** IN PROGRESS
**GitHub Issue:** #2 - Enhanced TradingView Webhook Parsing with OHLCV Data Support

## Summary

This plan implements enhanced TradingView webhook parsing to support OHLCV (Open, High, Low, Close, Volume) data extraction from TradingView alerts. The webhook already handles basic JSON payloads with validation and secret authentication. This enhancement adds:

1. **TradingView-specific JSON parsing** with placeholder variable support (`{{ticker}}`, `{{interval}}`, `{{time}}`, etc.)
2. **CSV format fallback parsing** for text/plain alerts
3. **OHLCV data extraction and storage** (database schema updates)
4. **Ticker to symbol field mapping**
5. **Comprehensive test coverage** for both formats

## Specifications Analyzed

- [x] `specs/feat-enhanced-tradingview-webhook-parsing-with-ohl.md` - **ACTIVE** - Current feature to implement
- [x] `specs/feature-implement-webhook-endpoint.md` - **COMPLETE** - Already implemented in PR #1
- [x] `specs/webhook-api.md` - **REFERENCE** - API specification (used for validation patterns)
- [x] `specs/dashboard.md` - **FUTURE** - Not in scope for this issue
- [x] `specs/trading-bot-master-plan.md` - **REFERENCE** - Architecture overview
- [x] `specs/topstepx-integration.md` - **FUTURE** - Not in scope for this issue

## Gap Analysis

### Currently Implemented ✅
| Component | Status | Location |
|-----------|--------|----------|
| POST `/api/webhook` endpoint | Complete | `api/webhook.ts` |
| JSON payload validation | Complete | `src/lib/validation.ts` |
| Secret authentication | Complete | `src/lib/validation.ts` |
| Structured logging with redaction | Complete | `src/lib/logger.ts` |
| Type definitions | Complete | `src/types/index.ts` |
| Unit tests for validation | Complete | `src/lib/validation.test.ts` |
| Unit tests for webhook handler | Complete | `api/webhook.test.ts` |

### Missing / Needs Implementation ❌
| Requirement | Spec Reference | Current State |
|-------------|----------------|---------------|
| TradingView JSON parsing with placeholders | feat-enhanced spec | Not implemented - expects strict `symbol` field, not `ticker` |
| CSV format fallback parsing | feat-enhanced spec | Not implemented - only JSON accepted |
| OHLCV field extraction (open, high, low, close, volume) | feat-enhanced spec | Not in types or validation |
| `interval` and `alert_time` field support | feat-enhanced spec | Not in types or validation |
| Ticker → Symbol field mapping | feat-enhanced spec | Not implemented |
| Quantity default to 1 | feat-enhanced spec | Currently required field, no default |
| Content-Type detection (JSON vs text/plain) | feat-enhanced spec | Not implemented |
| Database integration | feat-enhanced spec | No database configured |
| Database migration for OHLCV columns | feat-enhanced spec | No ORM/migration system in place |

### Architecture Decisions Required
1. **Database Choice**: No database is currently configured. Need to add PostgreSQL (Vercel Postgres) or similar
2. **ORM/Query Builder**: Need to choose Drizzle, Prisma, or raw pg client
3. **Migration Strategy**: Need migration system for schema changes

## Prioritized Tasks

### Phase 1: Type Definitions & Parser Foundation ✅ COMPLETE

- [x] **1.1** Add TradingView-specific types to `src/types/index.ts` - [Low complexity]
  - Add `TradingViewAlert` interface with OHLCV fields (ticker, interval, time, open, close, high, low, volume)
  - Add `OHLCVData` interface for extracted bar data
  - Add `ParsedWebhookPayload` union type for both formats

- [x] **1.2** Create TradingView parser module `src/lib/tradingview-parser.ts` - [Medium complexity]
  - Implement `parseJsonPayload()` for TradingView JSON format
  - Implement `parseCsvPayload()` for CSV fallback format
  - Implement `detectPayloadFormat()` to auto-detect JSON vs CSV
  - Map `ticker` → `symbol` field
  - Default `quantity` to 1 if not provided
  - Extract OHLCV data (open, high, low, close, volume)
  - Extract metadata (interval, alert_time)

- [x] **1.3** Write unit tests for TradingView parser `src/lib/tradingview-parser.test.ts` - [Medium complexity]
  - Test JSON parsing with all TradingView placeholder fields (40 tests)
  - Test CSV parsing fallback
  - Test missing optional fields (graceful defaults)
  - Test invalid action values
  - Test quantity defaulting to 1
  - Test ticker → symbol mapping
  - Test format detection logic

### Phase 2: Webhook Handler Integration

- [x] **2.1** Update validation module `src/lib/validation.ts` - [Medium complexity]
  - Add `validateTradingViewPayload()` function
  - Accept `ticker` as alternative to `symbol`
  - Make `quantity` optional (default to 1)
  - Add optional validation for OHLCV numeric fields
  - Add optional validation for `interval` string field
  - Add optional validation for `time` ISO timestamp field

- [x] **2.2** Update validation tests `src/lib/validation.test.ts` - [Low complexity]
  - Test ticker → symbol mapping
  - Test quantity defaulting to 1
  - Test OHLCV field validation (optional, numeric)
  - Test interval and time field validation

- [x] **2.3** Update webhook handler `api/webhook.ts` - [Medium complexity]
  - Add Content-Type detection (application/json vs text/plain)
  - Integrate TradingView parser for format detection
  - Parse both JSON and CSV formats
  - Include OHLCV data in response
  - Keep response time under 3 seconds

- [x] **2.4** Update webhook handler tests `api/webhook.test.ts` - [Medium complexity]
  - Test TradingView JSON format with all placeholder fields
  - Test CSV format parsing
  - Test Content-Type header handling
  - Test OHLCV data in response
  - Test quantity default behavior

### Phase 3: Database Integration

- [ ] **3.1** Set up database configuration - [Medium complexity]
  - Add `@vercel/postgres` or `pg` dependency to package.json
  - Create database connection utility `src/lib/db.ts`
  - Add database URL environment variable handling
  - Create connection pooling setup

- [ ] **3.2** Create database schema and migration - [Medium complexity]
  - Create `migrations/` directory structure
  - Create initial migration `001_create_alerts_table.sql`
  - Table: `alerts` with columns:
    - `id` (UUID, primary key)
    - `secret_hash` (TEXT) - for auditing, not the actual secret
    - `symbol` (TEXT, not null)
    - `action` (TEXT, not null)
    - `quantity` (INTEGER, not null, default 1)
    - `interval` (TEXT, nullable)
    - `alert_time` (TIMESTAMPTZ, nullable)
    - `open_price` (DECIMAL, nullable)
    - `high_price` (DECIMAL, nullable)
    - `low_price` (DECIMAL, nullable)
    - `close_price` (DECIMAL, nullable)
    - `bar_volume` (INTEGER, nullable)
    - `order_type` (TEXT, nullable)
    - `price` (DECIMAL, nullable)
    - `stop_loss` (DECIMAL, nullable)
    - `take_profit` (DECIMAL, nullable)
    - `comment` (TEXT, nullable)
    - `status` (TEXT, default 'received')
    - `created_at` (TIMESTAMPTZ, default now())
  - Add migration runner script to package.json

- [ ] **3.3** Create alert storage service `src/services/alert-storage.ts` - [Medium complexity]
  - Implement `saveAlert()` function
  - Map parsed webhook data to database columns
  - Handle database errors gracefully
  - Return alert ID on success

- [ ] **3.4** Write tests for alert storage `src/services/alert-storage.test.ts` - [Low complexity]
  - Test successful alert saving
  - Test with all OHLCV fields populated
  - Test with minimal required fields
  - Test error handling

### Phase 4: Integration & E2E Testing

- [ ] **4.1** Integrate storage into webhook handler - [Low complexity]
  - Call `saveAlert()` after validation
  - Return `alertId` in response instead of placeholder
  - Handle storage errors with appropriate response codes
  - Maintain response time under 3 seconds

- [ ] **4.2** Create E2E test suite `tests/e2e/webhook.e2e.test.ts` - [Medium complexity]
  - Test full webhook flow with TradingView-style JSON payload
  - Verify OHLCV data saved to database
  - Verify response within 3 seconds
  - Test with real database (test container or Vercel Postgres test DB)

- [ ] **4.3** Update response types if needed - [Low complexity]
  - Update `WebhookResponse` interface to include `alertId` field
  - Ensure response matches spec format

### Phase 5: Final Validation

- [ ] **5.1** Run full validation suite - [Low complexity]
  - Run `npm run validate` (lint + typecheck + test)
  - Fix any linting errors
  - Fix any type errors
  - Ensure all tests pass

- [ ] **5.2** Performance verification - [Low complexity]
  - Add timing logs to webhook handler
  - Verify response time under 3 seconds
  - Document any performance considerations

## Dependencies

```
Phase 1 (Types & Parser)
    │
    ├── 1.1 Types ──────────────────────┐
    │                                    │
    └── 1.2 Parser ─────────────────────┼──► Phase 2 (Handler Integration)
         │                               │         │
         └── 1.3 Parser Tests ──────────┘         │
                                                   │
Phase 2 (Handler Integration)                      │
    │                                              │
    ├── 2.1 Validation Updates ─────────┐         │
    │                                    │         │
    ├── 2.2 Validation Tests ───────────┤         │
    │                                    │         │
    ├── 2.3 Handler Updates ────────────┼─────────┘
    │                                    │
    └── 2.4 Handler Tests ──────────────┘
                    │
                    ▼
Phase 3 (Database) ─── Can be done in parallel with Phase 2
    │
    ├── 3.1 DB Config ──────────────────┐
    │                                    │
    ├── 3.2 Schema/Migration ───────────┤
    │                                    │
    ├── 3.3 Storage Service ────────────┤
    │                                    │
    └── 3.4 Storage Tests ──────────────┘
                    │
                    ▼
Phase 4 (Integration)
    │
    ├── 4.1 Integrate Storage ──────────┐
    │                                    │
    ├── 4.2 E2E Tests ──────────────────┤
    │                                    │
    └── 4.3 Response Types ─────────────┘
                    │
                    ▼
Phase 5 (Validation)
    │
    ├── 5.1 Full Validation Suite ──────┐
    │                                    │
    └── 5.2 Performance Check ──────────┘
```

## Notes

### Important Observations

1. **No Database Currently**: The project has no database integration. This is a significant addition that requires careful setup. Consider using `@vercel/postgres` for seamless Vercel integration.

2. **Response Time Constraint**: TradingView has a 3-second timeout. Database writes should be fast, or consider async/fire-and-forget patterns if needed.

3. **Backward Compatibility**: The existing JSON format with `symbol`, `action`, `quantity` must continue to work. The new TradingView format with `ticker` is additive.

4. **CSV Format Priority**: The spec mentions CSV as a "fallback" format. Prioritize JSON parsing; CSV is secondary.

5. **IP Allowlisting**: The spec mentions TradingView IPs (52.89.214.238, 34.212.75.30, 54.218.53.128, 52.32.178.7) for optional security. This is not required for MVP but could be added later.

6. **Secret in CSV**: The CSV format includes secret as first field. Need to handle secure logging (already have redaction in place).

### Open Questions

1. **Database Provider**: Should we use `@vercel/postgres` (Vercel-native) or `pg` with external PostgreSQL?
   - **Recommendation**: Use `@vercel/postgres` for simplicity with Vercel deployment

2. **Migration Tool**: Should we use a migration tool (Drizzle, Prisma) or raw SQL files?
   - **Recommendation**: Start with raw SQL files for simplicity, upgrade later if needed

### Risk Mitigation

- **Performance**: Add database connection pooling from the start
- **Reliability**: Use try-catch around database operations with fallback to success response
- **Testing**: Use test database for E2E tests, don't mock database layer

---

*Plan generated for GitHub Issue #2*
