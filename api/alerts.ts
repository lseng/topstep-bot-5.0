import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../src/lib/supabase';
import type { AlertsResponse, PaginationMeta } from '../src/types';
import type { AlertStatus, TradeAction } from '../src/types/database';

const VALID_SORT_COLUMNS = [
  'created_at',
  'symbol',
  'action',
  'quantity',
  'order_type',
  'price',
  'status',
];

const VALID_ACTIONS: TradeAction[] = ['buy', 'sell', 'close', 'close_long', 'close_short'];
const VALID_STATUSES: AlertStatus[] = ['received', 'processing', 'executed', 'failed', 'cancelled'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  // Parse query parameters
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  const action = req.query.action ? String(req.query.action) as TradeAction : undefined;
  const status = req.query.status ? String(req.query.status) as AlertStatus : undefined;
  const sort = req.query.sort ? String(req.query.sort) : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const name = req.query.name ? String(req.query.name) : undefined;

  // Validate sort column
  if (!VALID_SORT_COLUMNS.includes(sort)) {
    res.status(400).json({
      success: false,
      error: 'Invalid sort column',
      details: `Valid columns: ${VALID_SORT_COLUMNS.join(', ')}`,
    });
    return;
  }

  // Validate action filter
  if (action && !VALID_ACTIONS.includes(action)) {
    res.status(400).json({
      success: false,
      error: 'Invalid action filter',
      details: `Valid actions: ${VALID_ACTIONS.join(', ')}`,
    });
    return;
  }

  // Validate status filter
  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({
      success: false,
      error: 'Invalid status filter',
      details: `Valid statuses: ${VALID_STATUSES.join(', ')}`,
    });
    return;
  }

  // Validate date range
  if (from && isNaN(Date.parse(from))) {
    res.status(400).json({ success: false, error: 'Invalid from date' });
    return;
  }
  if (to && isNaN(Date.parse(to))) {
    res.status(400).json({ success: false, error: 'Invalid to date' });
    return;
  }

  try {
    // Build count query for pagination
    let countQuery = getSupabase().from('alerts').select('*', { count: 'exact', head: true });
    if (symbol) countQuery = countQuery.eq('symbol', symbol);
    if (action) countQuery = countQuery.eq('action', action);
    if (status) countQuery = countQuery.eq('status', status);
    if (from) countQuery = countQuery.gte('created_at', from);
    if (to) countQuery = countQuery.lte('created_at', to);
    if (name) countQuery = countQuery.eq('name', name);

    const { count, error: countError } = await countQuery;
    if (countError) {
      res.status(500).json({ success: false, error: 'Database error', details: countError.message });
      return;
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    // Build data query
    const offset = (page - 1) * limit;
    let dataQuery = getSupabase()
      .from('alerts')
      .select('*')
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (symbol) dataQuery = dataQuery.eq('symbol', symbol);
    if (action) dataQuery = dataQuery.eq('action', action);
    if (status) dataQuery = dataQuery.eq('status', status);
    if (from) dataQuery = dataQuery.gte('created_at', from);
    if (to) dataQuery = dataQuery.lte('created_at', to);
    if (name) dataQuery = dataQuery.eq('name', name);

    const { data, error: dataError } = await dataQuery;
    if (dataError) {
      res.status(500).json({ success: false, error: 'Database error', details: dataError.message });
      return;
    }

    const pagination: PaginationMeta = { page, limit, total, totalPages };
    const response: AlertsResponse = { success: true, data: data ?? [], pagination };
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Internal server error', details: message });
  }
}
