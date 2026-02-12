import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Types
type TradeAction = 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';
type AlertStatus = 'received' | 'processing' | 'executed' | 'failed' | 'cancelled';

interface WebhookAlert {
  secret: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  orderType?: 'market' | 'limit' | 'stop' | 'stop_limit';
  price?: number | null;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    alertId: string;
    symbol: string;
    action: TradeAction;
    quantity: number;
    status: AlertStatus;
    timestamp: string;
  };
  details?: string | ValidationError[];
}

// Valid trade actions
const VALID_ACTIONS: TradeAction[] = ['buy', 'sell', 'close', 'close_long', 'close_short'];

// Logger (inline, simplified)
const logger = {
  info: (message: string, data?: Record<string, unknown>): void => {
    const sanitized = data ? sanitizeData(data) : undefined;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message, data: sanitized }));
  },
  warn: (message: string, data?: Record<string, unknown>): void => {
    const sanitized = data ? sanitizeData(data) : undefined;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message, data: sanitized }));
  },
  error: (message: string, data?: Record<string, unknown>): void => {
    const sanitized = data ? sanitizeData(data) : undefined;
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message, data: sanitized }));
  },
};

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['secret', 'password', 'token', 'apiKey', 'api_key', 'authorization'];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Supabase client (lazy initialization)
function getSupabaseClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Validation functions
function validateWebhookSecret(secret: string | undefined): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return false;
  }
  return secret === webhookSecret;
}

function validateWebhookPayload(body: unknown): {
  valid: boolean;
  errors?: ValidationError[];
  payload?: WebhookAlert;
} {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = body as Record<string, unknown>;

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

  const payload: WebhookAlert = {
    secret: data.secret as string,
    symbol: data.symbol as string,
    action: data.action as TradeAction,
    quantity: data.quantity as number,
  };

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

// Save alert to Supabase
async function saveAlert(
  payload: WebhookAlert,
  rawPayload: Record<string, unknown>
): Promise<{ id: string } | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    logger.warn('Supabase not configured, skipping alert save');
    return null;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
  try {
    const { data, error } = await (supabase.from('alerts') as any)
      .insert({
        symbol: payload.symbol,
        action: payload.action,
        quantity: payload.quantity,
        order_type: payload.orderType || 'market',
        price: payload.price ?? null,
        stop_loss: payload.stopLoss ?? null,
        take_profit: payload.takeProfit ?? null,
        comment: payload.comment ?? null,
        status: 'received',
        raw_payload: rawPayload,
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to save alert to Supabase', { error: String(error.message) });
      return null;
    }

    const alertId = String(data?.id ?? '');
    logger.info('Alert saved to Supabase', { alertId });
    return { id: alertId };
  } catch (err) {
    logger.error('Supabase error', { error: err instanceof Error ? err.message : 'Unknown error' });
    return null;
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
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

  // Save alert to Supabase
  const rawPayload = { ...req.body } as Record<string, unknown>;
  delete rawPayload.secret; // Don't store the secret
  const savedAlert = await saveAlert(payload, rawPayload);

  // Return success response
  const response: WebhookResponse = {
    success: true,
    message: 'Webhook received and validated',
    data: {
      alertId: savedAlert?.id || 'not-saved',
      symbol: payload.symbol,
      action: payload.action,
      quantity: payload.quantity,
      status: 'received',
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}
