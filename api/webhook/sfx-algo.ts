import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../../src/lib/logger';
import { validateWebhookSecret } from '../../src/lib/validation';
import { saveRawWebhook } from '../../src/services/raw-webhook-storage';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const secret = String(req.query.secret ?? '');
  if (!validateWebhookSecret(secret)) {
    logger.warn('Invalid webhook secret on sfx-algo endpoint');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
  const contentType = (req.headers['content-type'] as string) ?? null;

  try {
    const eventId = await saveRawWebhook('sfx_algo_alerts', {
      source: 'sfx-algo',
      rawBody,
      contentType,
    });
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to store sfx-algo webhook', { error: message });
    res.status(500).json({ success: false, error: 'Storage error' });
  }
}
