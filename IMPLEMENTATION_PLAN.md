# Implementation Plan

**Last Updated:** 2026-02-11T23:33:00Z
**Status:** COMPLETE
**Feature:** Implement Webhook Endpoint (GitHub Issue #1)

## Summary

Implement the main TradingView webhook endpoint (`POST /api/webhook`) that receives trading alerts and processes trading signals. The endpoint must validate authentication via a secret, parse and validate the request body, and return appropriate responses.

## Specifications Analyzed

- [x] specs/feature-implement-webhook-endpoint.md - Analyzed (primary spec for this feature)

## Gap Analysis

### What's Specified

The spec requires:
1. **POST /api/webhook endpoint** that receives TradingView alerts
2. **Authentication** - Validate `secret` field matches `WEBHOOK_SECRET` env var
3. **Request validation** - Parse JSON, validate required fields (`secret`, `symbol`, `action`, `quantity`)
4. **Action validation** - Must be one of: `buy`, `sell`, `close`, `close_long`, `close_short`
5. **Response format** - Success: `{ success: true, message, data }`, Error: `{ success: false, error, details }`
6. **Logging** - Log all requests (redact secret), validation errors, and processing results
7. **Tests** - Tests must pass

### What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `api/webhook.ts` | ✅ Complete | Webhook endpoint implemented |
| Type definitions | ✅ Complete | `src/types/index.ts` has `WebhookAlert`, `TradeAction`, `WebhookResponse`, `ValidationError` |
| Logger | ✅ Complete | `src/lib/logger.ts` with redaction support |
| Health endpoint | ✅ Complete | `api/health.ts` (reference for Vercel handler pattern) |
| Validation utilities | ✅ Complete | `src/lib/validation.ts` with validation functions |

### Gap Summary

1. **Missing `api/webhook.ts`** - The main webhook handler file does not exist
2. **Missing validation logic** - Need to validate request body fields and types
3. **Missing tests** - No tests for the webhook endpoint

## Prioritized Tasks

### Phase 1: Validation Utilities

- [x] Create `src/lib/validation.ts` - Request body validation functions for WebhookAlert type
- [x] Create `src/lib/validation.test.ts` - Unit tests for validation functions

### Phase 2: Webhook Endpoint

- [x] Create `api/webhook.ts` - Main webhook handler with auth, validation, and logging
- [x] Create `api/webhook.test.ts` - Integration tests for webhook endpoint

### Phase 3: Verification

- [x] Run `npm run validate` - Ensure lint, typecheck, and tests all pass

## Task Details

### Task 1: Create `src/lib/validation.ts`

**Purpose:** Provide reusable validation functions for webhook request bodies.

**Functions to implement:**
- `validateWebhookSecret(secret: string | undefined): boolean` - Check if secret matches env var
- `validateWebhookPayload(body: unknown): { valid: boolean; errors?: ValidationError[]; payload?: WebhookAlert }` - Validate all required fields

**Requirements:**
- Check required fields: `secret`, `symbol`, `action`, `quantity`
- Validate `action` is one of the allowed TradeAction values
- Validate `quantity` is a positive number
- Return detailed validation errors with field names

### Task 2: Create `src/lib/validation.test.ts`

**Purpose:** Unit tests for validation functions.

**Test cases:**
- Valid payload passes validation
- Missing required fields return appropriate errors
- Invalid action type returns error
- Invalid quantity (negative, zero, non-number) returns error
- Secret validation works correctly

### Task 3: Create `api/webhook.ts`

**Purpose:** Main webhook endpoint handler.

**Implementation:**
- Only accept POST method (return 405 for others)
- Parse JSON body (return 400 on parse failure)
- Validate secret (return 401 if invalid)
- Validate payload (return 400 with errors if invalid)
- Log all operations with redacted sensitive data
- Return success response with processed data
- Use existing types from `src/types/index.ts`
- Follow pattern from `api/health.ts`

**Response codes:**
- 200: Success
- 400: Validation error (missing fields, invalid values)
- 401: Invalid secret
- 405: Method not allowed
- 500: Internal server error

### Task 4: Create `api/webhook.test.ts`

**Purpose:** Integration tests for webhook endpoint.

**Test cases:**
- Valid POST with correct secret returns 200
- Missing secret returns 401
- Invalid secret returns 401
- Missing required fields return 400 with error details
- Invalid action returns 400
- Invalid quantity returns 400
- Non-POST method returns 405
- Response format matches specification

### Task 5: Run Validation

**Purpose:** Ensure all code quality checks pass.

**Commands:**
- `npm run lint` - ESLint with 0 warnings
- `npm run typecheck` - TypeScript compilation
- `npm run test` - Vitest tests

## Dependencies

```
Task 1 (validation.ts) ─┬─> Task 3 (webhook.ts) ───> Task 5 (validate)
                        │
Task 2 (validation.test.ts) ─────────────────────┘
                        │
                        └─> Task 4 (webhook.test.ts) ─> Task 5 (validate)
```

**Dependency order:**
1. Task 1 must be completed first (validation utilities needed by webhook)
2. Tasks 2, 3, 4 can be done in any order after Task 1
3. Task 5 must be done last (requires all code to be in place)

## Notes

1. **Existing type definitions are complete** - No changes needed to `src/types/index.ts`
2. **Logger already supports redaction** - Use existing logger for all logging
3. **Follow Vercel patterns** - Use `api/health.ts` as reference for handler structure
4. **Test coverage** - Include both unit tests (validation) and integration tests (endpoint)
5. **No external dependencies** - Use native TypeScript/JavaScript for validation

---

BUILD COMPLETE - All tasks implemented

## Implementation Summary

All tasks have been completed successfully:

1. **src/lib/validation.ts** - Implements `validateWebhookSecret` and `validateWebhookPayload` functions
2. **src/lib/validation.test.ts** - 20 unit tests covering all validation scenarios
3. **api/webhook.ts** - Main webhook endpoint handler with auth, validation, and logging
4. **api/webhook.test.ts** - 17 integration tests covering HTTP methods, auth, and payload validation
5. **Validation passed** - Lint (0 warnings), TypeScript (no errors), Tests (47 passed)
