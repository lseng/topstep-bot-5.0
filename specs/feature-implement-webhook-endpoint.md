# Feature: Implement Webhook Endpoint

**Type:** Feature
**GitHub Issue:** #1
**Labels:** none

## Overview

## Overview
Implement the main TradingView webhook endpoint that receives alerts and processes trading signals.

## Requirements

### Endpoint: POST /api/webhook

1. **Authentication**
   - Validate `secret` field in request body matches `WEBHOOK_SECRET` env var
   - Return 401 if invalid

2. **Request Validation**
   - Parse JSON body
   - Validate required fields: `secret`, `symbol`, `action`, `quantity`
   - Validate action is one of: `buy`, `sell`, `close`, `close_long`, `close_short`
   - Return 400 with details if validation fails

3. **Response Format**
   - Success (200): `{ success: true, message: "...", data: {...} }`
   - Error (4xx/5xx): `{ success: false, error: "...", details: "..." }`

4. **Logging**
   - Log all incoming requests (redact secret)
   - Log validation errors
   - Log processing results

## Acceptance Criteria
- [ ] POST /api/webhook accepts TradingView alert payloads
- [ ] Secret validation works correctly
- [ ] Invalid requests return proper error responses
- [ ] All operations are logged
- [ ] Tests pass

## Reference
See `specs/webhook-api.md` for full specification.

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/1
- Created: 2026-02-11 23:25:25+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #1*
