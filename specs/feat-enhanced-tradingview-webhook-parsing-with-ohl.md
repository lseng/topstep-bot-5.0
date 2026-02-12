# feat: Enhanced TradingView webhook parsing with OHLCV data support

**Type:** Feature
**GitHub Issue:** #2
**Labels:** none

## Overview

## Summary

Enhance the webhook endpoint to parse TradingView alert messages and store OHLCV (Open, High, Low, Close, Volume) data along with the trade signal.

## Background

TradingView sends webhook alerts in a specific format when price alerts trigger. The current webhook expects a strict JSON format, but TradingView alerts can be configured to send either:
- Plain text (comma-separated values)
- JSON format

We need to support both formats and parse TradingView's placeholder variables.

## TradingView Alert Configuration

**Webhook URL:** `https://topstep-bot-50.vercel.app/api/webhook`

**Alert Message Format (to configure in TradingView):**
```json
{
  "secret": "YOUR_WEBHOOK_SECRET",
  "action": "{{strategy.order.action}}",
  "ticker": "{{ticker}}",
  "interval": "{{interval}}",
  "time": "{{time}}",
  "open": {{open}},
  "close": {{close}},
  "high": {{high}},
  "low": {{low}},
  "volume": {{volume}},
  "quantity": 1
}
```

**Alternative CSV format (fallback parsing):**
```
YOUR_SECRET, buy, ES, 5, 2024-01-15T10:30:00Z, 4850.25, 4852.50, 4853.00, 4849.75, 12500
```

## TradingView Placeholder Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{ticker}}` | Symbol/instrument | ES, NQ, MES |
| `{{interval}}` | Timeframe | 1, 5, 15, 60, D |
| `{{time}}` | Alert trigger time | ISO timestamp |
| `{{open}}` | Bar open price | 4850.25 |
| `{{close}}` | Bar close price | 4852.50 |
| `{{high}}` | Bar high price | 4853.00 |
| `{{low}}` | Bar low price | 4849.75 |
| `{{volume}}` | Bar volume | 12500 |
| `{{strategy.order.action}}` | buy or sell | buy |

## Requirements

### Webhook Parsing
- [ ] Auto-detect JSON vs CSV format from Content-Type header and body
- [ ] Parse JSON format with TradingView placeholders
- [ ] Parse CSV fallback: `secret, action, ticker, interval, time, open, close, high, low, volume, quantity`
- [ ] Map `ticker` to `symbol` field
- [ ] Default quantity to 1 if not provided
- [ ] Validate action is 'buy' or 'sell' (map to existing TradeAction type)

### Database Schema Updates
- [ ] Add `interval` column (TEXT) - timeframe of the alert
- [ ] Add `alert_time` column (TIMESTAMPTZ) - time from TradingView ({{time}})
- [ ] Add `open_price` column (DECIMAL) - bar open
- [ ] Add `high_price` column (DECIMAL) - bar high  
- [ ] Add `low_price` column (DECIMAL) - bar low
- [ ] Add `close_price` column (DECIMAL) - bar close
- [ ] Add `bar_volume` column (INTEGER) - bar volume
- [ ] Create migration file

### IP Allowlisting (Optional Security)
TradingView webhook IPs for reference (can be used for additional validation):
- 52.89.214.238
- 34.212.75.30
- 54.218.53.128
- 52.32.178.7

### Response Format
Keep existing response format:
```json
{
  "success": true,
  "message": "Webhook received and validated",
  "data": {
    "alertId": "uuid",
    "symbol": "ES",
    "action": "buy",
    "quantity": 1,
    "status": "received",
    "timestamp": "ISO timestamp"
  }
}
```

## Technical Notes

- TradingView has a **3-second timeout** - response must be fast
- Only ports **80 and 443** are supported (Vercel handles this)
- TradingView requires **2FA enabled** on account for webhooks
- Content-Type will be `application/json` for JSON, `text/plain` for text

## Testing

### Unit Tests
- [ ] Test JSON parsing with all TradingView fields
- [ ] Test CSV parsing fallback
- [ ] Test missing optional fields (graceful defaults)
- [ ] Test invalid action values
- [ ] Test quantity defaulting to 1

### E2E Tests
- [ ] Test full webhook flow with TradingView-style JSON payload
- [ ] Verify OHLCV data saved to database
- [ ] Verify response within 3 seconds

## Acceptance Criteria

1. Webhook accepts TradingView JSON format with all placeholders
2. Webhook accepts CSV format as fallback
3. OHLCV data stored in database for later analysis
4. All existing tests still pass
5. Response time under 3 seconds
6. Secret validation still required

## Future Considerations

> ⚠️ This issue is for **receiving and storing alerts only**. Trade execution will be handled separately with additional confirmations and risk checks.

---

/adw
iterations: unlimited
agents: ralph
e2e: required
database: migration required

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: https://github.com/lseng/topstep-bot-5.0/issues/2
- Created: 2026-02-12 00:57:10+00:00
- Author: lseng

---
*This spec was auto-generated from GitHub issue #2*
