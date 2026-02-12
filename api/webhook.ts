import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../src/lib/logger';
import { validateWebhookSecret, validateTradingViewPayload } from '../src/lib/validation';
import { parseWebhookPayload } from '../src/lib/tradingview-parser';
import { saveAlert } from '../src/services/alert-storage';
import { isDatabaseConfigured } from '../src/lib/db';
import type { WebhookResponse, ParsedWebhookPayload } from '../src/types';

/**
 * Determines if the request body needs text parsing based on Content-Type
 * Returns true if body is a string (text/plain) or needs parsing
 */
function isTextContent(req: VercelRequest): boolean {
  const contentType = req.headers['content-type'] || '';
  return contentType.includes('text/plain');
}

/**
 * Gets the raw body content as a string for parsing
 * Handles both text/plain and application/json content types
 */
function getBodyContent(req: VercelRequest): string | null {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Only accept POST requests
  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method });
    const response: WebhookResponse = {
      success: false,
      error: 'Method not allowed',
      details: 'Only POST requests are accepted',
    };
    res.status(405).json(response);
    return;
  }

  // Log incoming request with content type
  const contentType = req.headers['content-type'] || 'not specified';
  logger.info('Webhook request received', { contentType, body: req.body });

  let payload: ParsedWebhookPayload;

  // Determine parsing strategy based on Content-Type
  if (isTextContent(req)) {
    // For text/plain content, use the TradingView parser to detect format
    const bodyContent = getBodyContent(req);
    if (!bodyContent) {
      logger.warn('Empty request body');
      const response: WebhookResponse = {
        success: false,
        error: 'Validation failed',
        details: 'Request body is required',
      };
      res.status(400).json(response);
      return;
    }

    const parseResult = parseWebhookPayload(bodyContent);
    if (!parseResult.success) {
      logger.warn('Parsing failed', { error: parseResult.error });
      const response: WebhookResponse = {
        success: false,
        error: 'Validation failed',
        details: parseResult.error,
      };
      res.status(400).json(response);
      return;
    }

    payload = parseResult.payload;
  } else {
    // For JSON content (default), use validateTradingViewPayload
    // This supports both original format (symbol required) and TradingView format (ticker or symbol)
    const validation = validateTradingViewPayload(req.body);
    if (!validation.valid) {
      logger.warn('Validation failed', { errors: validation.errors });
      const response: WebhookResponse = {
        success: false,
        error: 'Validation failed',
        details: validation.errors,
      };
      res.status(400).json(response);
      return;
    }

    payload = validation.payload!;
  }

  // Validate the secret
  if (!validateWebhookSecret(payload.secret)) {
    logger.warn('Invalid webhook secret');
    const response: WebhookResponse = {
      success: false,
      error: 'Unauthorized',
      details: 'Invalid webhook secret',
    };
    res.status(401).json(response);
    return;
  }

  // Log successful validation with OHLCV data if present
  logger.info('Webhook validated successfully', {
    symbol: payload.symbol,
    action: payload.action,
    quantity: payload.quantity,
    interval: payload.interval,
    alertTime: payload.alertTime?.toISOString(),
    hasOhlcv: !!payload.ohlcv,
  });

  // Persist alert to database if configured
  let alertId: string | undefined;
  if (isDatabaseConfigured()) {
    try {
      alertId = await saveAlert(payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown storage error';
      logger.error('Failed to save alert to database', { error: errorMessage });
      const response: WebhookResponse = {
        success: false,
        error: 'Storage error',
        details: 'Failed to persist alert',
      };
      res.status(500).json(response);
      return;
    }
  }

  // Build response data with OHLCV information
  const responseData: WebhookResponse['data'] = {
    alertId,
    orderId: 'pending',
    symbol: payload.symbol,
    action: payload.action,
    quantity: payload.quantity,
    status: 'Pending',
    timestamp: new Date().toISOString(),
  };

  // Build success response
  // Note: Actual order execution will be implemented in a future task
  const response: WebhookResponse = {
    success: true,
    message: 'Webhook received and validated',
    data: responseData,
  };

  // Add OHLCV data to response if present (for debugging/logging purposes)
  if (payload.ohlcv || payload.interval || payload.alertTime) {
    const extendedResponse = response as WebhookResponse & {
      tradingViewData?: {
        interval?: string;
        alertTime?: string;
        ohlcv?: typeof payload.ohlcv;
      };
    };
    extendedResponse.tradingViewData = {
      interval: payload.interval,
      alertTime: payload.alertTime?.toISOString(),
      ohlcv: payload.ohlcv,
    };
    res.status(200).json(extendedResponse);
    return;
  }

  res.status(200).json(response);
}
