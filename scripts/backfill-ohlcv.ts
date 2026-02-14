import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

try {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch { /* */ }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function tickerToSymbol(ticker: string): string {
  const afterColon = ticker.includes(':') ? ticker.split(':')[1] : ticker;
  return afterColon.replace(/\d+!.*$/, '').trim();
}

interface CsvOhlcv {
  symbol: string;
  time: string;
  name: string;
  action: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: string;
  ticker: string;
}

function parseCsvOhlcv(csvPath: string): CsvOhlcv[] {
  const content = readFileSync(csvPath, 'utf-8');
  const entries: CsvOhlcv[] = [];

  const rows: string[] = [];
  let current = '';
  for (const line of content.split('\n')) {
    if (/^\d{10},/.test(line) && current) {
      rows.push(current);
      current = line;
    } else if (current) {
      current += '\n' + line;
    } else {
      if (line.startsWith('Alert ID')) continue;
      current = line;
    }
  }
  if (current) rows.push(current);

  for (const row of rows) {
    const timeMatch = row.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s*$/);
    if (!timeMatch) continue;
    const firedTime = timeMatch[1];

    const tickerMatch = row.match(/^\d+,"([^"]+)"/);
    if (!tickerMatch) continue;
    const ticker = tickerMatch[1].split(',')[0].trim();
    const symbol = tickerToSymbol(ticker);

    const nameMatch = row.match(/,(BUY|SELL): ([^,]+),/i);
    if (!nameMatch) continue;
    const action = nameMatch[1].toLowerCase();
    const name = nameMatch[2].trim();

    // JSON payload
    const jsonMatch = row.match(/\{[\s\S]*?"open"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[0].replace(/""/g, '"');
        const p = JSON.parse(jsonStr);
        entries.push({
          symbol, time: firedTime, name, action, ticker,
          open: p.open, high: p.high, low: p.low, close: p.close,
          volume: p.volume, interval: p.interval ?? '1',
        });
        continue;
      } catch { /* */ }
    }

    // Plain text: "sell, MES1!, 1, 2026-..., open, close, high, low, volume"
    const descMatch = row.match(/,"((?:buy|sell), [^"]+)"/i);
    if (descMatch) {
      const parts = descMatch[1].split(',').map(s => s.trim());
      if (parts.length >= 9) {
        entries.push({
          symbol, time: firedTime, name, action, ticker,
          open: parseFloat(parts[4]),
          close: parseFloat(parts[5]),
          high: parseFloat(parts[6]),
          low: parseFloat(parts[7]),
          volume: parseInt(parts[8], 10),
          interval: '1',
        });
      }
    }
  }

  return entries;
}

function withinSeconds(a: string, b: string, secs: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= secs * 1000;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx vite-node scripts/backfill-ohlcv.ts <csv-path>');
    process.exit(1);
  }

  const csvData = parseCsvOhlcv(csvPath);
  console.log(`Parsed ${csvData.length} entries with OHLCV from CSV\n`);

  // Find alerts missing OHLCV in raw_payload
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('id, created_at, symbol, action, price, name, raw_payload')
    .order('created_at', { ascending: true });

  if (error) { console.error('Error:', error.message); process.exit(1); }

  let updated = 0;
  for (const alert of alerts!) {
    const raw = alert.raw_payload as Record<string, unknown> | null;
    if (!raw) continue;

    // Check if OHLCV is missing
    const hasOhlcv = typeof raw.open === 'number' && typeof raw.high === 'number';
    if (hasOhlcv) continue;

    // Find matching CSV entry
    const match = csvData.find(c =>
      c.symbol === alert.symbol &&
      withinSeconds(alert.created_at, c.time, 120)
    );

    if (!match) {
      console.log(`  NO CSV MATCH: ${alert.created_at} | ${alert.symbol} | ${alert.name}`);
      continue;
    }

    const updatedPayload = {
      ...raw,
      name: match.name,
      action: alert.action,
      ticker: match.ticker,
      open: match.open,
      high: match.high,
      low: match.low,
      close: match.close,
      volume: match.volume,
      interval: match.interval,
      time: match.time,
      quantity: 1,
    };
    // Remove csv-sync source marker
    delete (updatedPayload as Record<string, unknown>).source;

    const { error: updateErr } = await supabase
      .from('alerts')
      .update({ raw_payload: updatedPayload })
      .eq('id', alert.id);

    if (updateErr) {
      console.error(`  ERROR updating ${alert.id}:`, updateErr.message);
    } else {
      console.log(`  Fixed: ${alert.created_at} | ${alert.symbol.padEnd(4)} | O:${match.open} H:${match.high} L:${match.low} C:${match.close} V:${match.volume}`);
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} alerts with OHLCV data.`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
