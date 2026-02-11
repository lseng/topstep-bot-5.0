// Webhook request validation utilities

import type { TradeAction, ValidationError, WebhookAlert } from '../types';

// Valid trade actions
const VALID_ACTIONS: TradeAction[] = ['buy', 'sell', 'close', 'close_long', 'close_short'];

/**
 * Validates that the provided secret matches the WEBHOOK_SECRET environment variable
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return false;
  }
  return secret === webhookSecret;
}

/**
 * Validates a webhook payload and returns validation result
 */
export function validateWebhookPayload(body: unknown): {
  valid: boolean;
  errors?: ValidationError[];
  payload?: WebhookAlert;
} {
  const errors: ValidationError[] = [];

  // Check if body is an object
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = body as Record<string, unknown>;

  // Check required fields
  if (!data.secret || typeof data.secret !== 'string') {
    errors.push({ field: 'secret', message: 'Secret is required and must be a string' });
  }

  if (!data.symbol || typeof data.symbol !== 'string') {
    errors.push({ field: 'symbol', message: 'Symbol is required and must be a string' });
  }

  if (!data.action || typeof data.action !== 'string') {
    errors.push({ field: 'action', message: 'Action is required and must be a string' });
  } else if (!VALID_ACTIONS.includes(data.action as TradeAction)) {
    errors.push({
      field: 'action',
      message: `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
    });
  }

  if (data.quantity === undefined || data.quantity === null) {
    errors.push({ field: 'quantity', message: 'Quantity is required' });
  } else if (typeof data.quantity !== 'number') {
    errors.push({ field: 'quantity', message: 'Quantity must be a number' });
  } else if (data.quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Quantity must be a positive number' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated payload
  const payload: WebhookAlert = {
    secret: data.secret as string,
    symbol: data.symbol as string,
    action: data.action as TradeAction,
    quantity: data.quantity as number,
  };

  // Add optional fields if present
  if (data.orderType && typeof data.orderType === 'string') {
    payload.orderType = data.orderType as WebhookAlert['orderType'];
  }
  if (typeof data.price === 'number' || data.price === null) {
    payload.price = data.price;
  }
  if (typeof data.stopLoss === 'number') {
    payload.stopLoss = data.stopLoss;
  }
  if (typeof data.takeProfit === 'number') {
    payload.takeProfit = data.takeProfit;
  }
  if (typeof data.comment === 'string') {
    payload.comment = data.comment;
  }

  return { valid: true, payload };
}
