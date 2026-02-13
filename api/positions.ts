import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../src/lib/supabase';

const VALID_SORT_COLUMNS = [
  'created_at',
  'updated_at',
  'symbol',
  'side',
  'state',
  'entry_price',
  'unrealized_pnl',
];

const VALID_STATES = [
  'pending_entry',
  'active',
  'tp1_hit',
  'tp2_hit',
  'tp3_hit',
  'closed',
  'cancelled',
];

const VALID_SIDES = ['long', 'short'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  // Parse query parameters
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  const state = req.query.state ? String(req.query.state) : undefined;
  const side = req.query.side ? String(req.query.side) : undefined;
  const sort = req.query.sort ? String(req.query.sort) : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';

  // Validate sort column
  if (!VALID_SORT_COLUMNS.includes(sort)) {
    res.status(400).json({
      success: false,
      error: 'Invalid sort column',
      details: `Valid columns: ${VALID_SORT_COLUMNS.join(', ')}`,
    });
    return;
  }

  // Validate state filter
  if (state && !VALID_STATES.includes(state)) {
    res.status(400).json({
      success: false,
      error: 'Invalid state filter',
      details: `Valid states: ${VALID_STATES.join(', ')}`,
    });
    return;
  }

  // Validate side filter
  if (side && !VALID_SIDES.includes(side)) {
    res.status(400).json({
      success: false,
      error: 'Invalid side filter',
      details: `Valid sides: ${VALID_SIDES.join(', ')}`,
    });
    return;
  }

  try {
    // Count query for pagination
    let countQuery = getSupabase().from('positions').select('*', { count: 'exact', head: true });
    if (symbol) countQuery = countQuery.eq('symbol', symbol);
    if (state) countQuery = countQuery.eq('state', state);
    if (side) countQuery = countQuery.eq('side', side);

    const { count, error: countError } = await countQuery;
    if (countError) {
      res.status(500).json({ success: false, error: 'Database error', details: countError.message });
      return;
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    // Data query
    const offset = (page - 1) * limit;
    let dataQuery = getSupabase()
      .from('positions')
      .select('*')
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (symbol) dataQuery = dataQuery.eq('symbol', symbol);
    if (state) dataQuery = dataQuery.eq('state', state);
    if (side) dataQuery = dataQuery.eq('side', side);

    const { data, error: dataError } = await dataQuery;
    if (dataError) {
      res.status(500).json({ success: false, error: 'Database error', details: dataError.message });
      return;
    }

    res.status(200).json({
      success: true,
      data: data ?? [],
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Internal server error', details: message });
  }
}
