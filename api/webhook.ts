import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../src/lib/logger';
import { validateWebhookSecret, validateWebhookPayload } from '../src/lib/validation';
import type { WebhookResponse } from '../src/types';

export default function handler(req: VercelRequest, res: VercelResponse): void {
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

  // Log incoming request
  logger.info('Webhook request received', { body: req.body });

  // Parse and validate the request body
  const validation = validateWebhookPayload(req.body);
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

  const payload = validation.payload!;

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

  // Log successful validation
  logger.info('Webhook validated successfully', {
    symbol: payload.symbol,
    action: payload.action,
    quantity: payload.quantity,
  });

  // Return success response
  // Note: Actual order execution will be implemented in a future task
  const response: WebhookResponse = {
    success: true,
    message: 'Webhook received and validated',
    data: {
      orderId: 'pending',
      symbol: payload.symbol,
      action: payload.action,
      quantity: payload.quantity,
      status: 'Pending',
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}
