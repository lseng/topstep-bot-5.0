import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../src/lib/supabase';
import type { SfxAlgoAlertsResponse, PaginationMeta } from '../src/types';

const VALID_SORT_COLUMNS = ['created_at', 'source', 'symbol', 'alert_type', 'signal_direction', 'price'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
  const source = req.query.source ? String(req.query.source) : undefined;
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  const alertType = req.query.alert_type ? String(req.query.alert_type) : undefined;
  const signalDirection = req.query.signal_direction ? String(req.query.signal_direction) : undefined;
  const sort = req.query.sort ? String(req.query.sort) : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  if (!VALID_SORT_COLUMNS.includes(sort)) {
    res.status(400).json({
      success: false,
      error: 'Invalid sort column',
      details: `Valid columns: ${VALID_SORT_COLUMNS.join(', ')}`,
    });
    return;
  }

  if (from && isNaN(Date.parse(from))) {
    res.status(400).json({ success: false, error: 'Invalid from date' });
    return;
  }
  if (to && isNaN(Date.parse(to))) {
    res.status(400).json({ success: false, error: 'Invalid to date' });
    return;
  }

  try {
    let countQuery = getSupabase().from('sfx_algo_alerts').select('*', { count: 'exact', head: true });
    if (source) countQuery = countQuery.eq('source', source);
    if (symbol) countQuery = countQuery.eq('symbol', symbol);
    if (alertType) countQuery = countQuery.eq('alert_type', alertType);
    if (signalDirection) countQuery = countQuery.eq('signal_direction', signalDirection);
    if (from) countQuery = countQuery.gte('created_at', from);
    if (to) countQuery = countQuery.lte('created_at', to);

    const { count, error: countError } = await countQuery;
    if (countError) {
      res.status(500).json({ success: false, error: 'Database error', details: countError.message });
      return;
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    let dataQuery = getSupabase()
      .from('sfx_algo_alerts')
      .select('*')
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (source) dataQuery = dataQuery.eq('source', source);
    if (symbol) dataQuery = dataQuery.eq('symbol', symbol);
    if (alertType) dataQuery = dataQuery.eq('alert_type', alertType);
    if (signalDirection) dataQuery = dataQuery.eq('signal_direction', signalDirection);
    if (from) dataQuery = dataQuery.gte('created_at', from);
    if (to) dataQuery = dataQuery.lte('created_at', to);

    const { data, error: dataError } = await dataQuery;
    if (dataError) {
      res.status(500).json({ success: false, error: 'Database error', details: dataError.message });
      return;
    }

    const pagination: PaginationMeta = { page, limit, total, totalPages };
    const response: SfxAlgoAlertsResponse = { success: true, data: data ?? [], pagination };
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Internal server error', details: message });
  }
}
