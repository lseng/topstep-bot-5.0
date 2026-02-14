import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load env
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

// Parse ticker to symbol: "CME_MINI:NQ1!" -> "NQ", "NYMEX:MNG1!" -> "MNG"
function tickerToSymbol(ticker: string): string {
  // Remove exchange prefix
  const afterColon = ticker.includes(':') ? ticker.split(':')[1] : ticker;
  // Remove trailing "1!" or similar
  return afterColon.replace(/\d+!.*$/, '').trim();
}

interface CsvAlert {
  symbol: string;
  action: string;
  price: number;
  time: string; // ISO timestamp when TV fired the alert
  name: string;
}

function parseCsv(csvPath: string): CsvAlert[] {
  const content = readFileSync(csvPath, 'utf-8');
  const alerts: CsvAlert[] = [];

  // Split by lines, skip header
  // CSV has multi-line Description fields enclosed in quotes
  // Strategy: split by alert rows using the Alert ID pattern
  const rows: string[] = [];
  let current = '';
  for (const line of content.split('\n')) {
    if (/^\d{10},/.test(line) && current) {
      rows.push(current);
      current = line;
    } else if (current) {
      current += '\n' + line;
    } else {
      if (line.startsWith('Alert ID')) continue; // header
      current = line;
    }
  }
  if (current) rows.push(current);

  for (const row of rows) {
    // Extract the last timestamp (fired time)
    const timeMatch = row.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s*$/);
    if (!timeMatch) continue;
    const firedTime = timeMatch[1];

    // Extract ticker from second field
    const tickerMatch = row.match(/^\d+,"([^"]+)"/);
    if (!tickerMatch) continue;
    const ticker = tickerMatch[1].split(',')[0].trim();
    const symbol = tickerToSymbol(ticker);

    // Extract action + name from the Name column (e.g., "BUY: day-trader-long-term-AI")
    // The Name column BUY/SELL is the source of truth for the action
    const nameMatch = row.match(/,(BUY|SELL): ([^,]+),/i);
    if (!nameMatch) continue;
    const action = nameMatch[1].toLowerCase(); // BUY/SELL from Name column
    const name = nameMatch[2].trim();

    // Try to parse JSON payload for the price (use "open" field)
    const jsonMatch = row.match(/\{[\s\S]*?"open"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[0].replace(/""/g, '"');
        const payload = JSON.parse(jsonStr);
        alerts.push({
          symbol,
          action,
          price: payload.open,
          time: firedTime,
          name: payload.name || name,
        });
        continue;
      } catch { /* fall through to plain text */ }
    }

    // Plain text payload: "sell, MES1!, 1, 2026-02-12T06:35:00Z, 6975.25, 6974.00, ..."
    const descMatch = row.match(/,"((?:buy|sell), [^"]+)"/i);
    if (descMatch) {
      const parts = descMatch[1].split(',').map(s => s.trim());
      if (parts.length >= 5) {
        alerts.push({
          symbol,
          action,
          price: parseFloat(parts[4]),
          time: firedTime,
          name,
        });
        continue;
      }
    }
  }

  return alerts;
}

// Check if two timestamps are within N seconds
function withinSeconds(a: string, b: string, secs: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= secs * 1000;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx vite-node scripts/sync-csv-to-supabase.ts <csv-path>');
    process.exit(1);
  }

  const csvAlerts = parseCsv(csvPath);
  console.log(`Parsed ${csvAlerts.length} alerts from CSV\n`);

  // Fetch all existing Supabase alerts
  const { data: dbAlerts, error } = await supabase
    .from('alerts')
    .select('id, created_at, symbol, action, price, status, name')
    .order('created_at', { ascending: true });

  if (error) { console.error('DB error:', error.message); process.exit(1); }
  console.log(`Found ${dbAlerts!.length} alerts in Supabase\n`);

  const toInsert: CsvAlert[] = [];
  const toUpdate: { id: string; action: string; name: string; csvAction: string; dbAction: string; symbol: string; time: string }[] = [];

  for (const csv of csvAlerts) {
    // Find matching DB entry: same symbol + within 120 seconds
    const match = dbAlerts!.find(db =>
      db.symbol === csv.symbol &&
      withinSeconds(db.created_at, csv.time, 120)
    );

    if (!match) {
      toInsert.push(csv);
    } else {
      // Check if action or name needs updating
      const needsActionFix = match.action !== csv.action;
      const needsNameFix = !match.name && csv.name;
      if (needsActionFix || needsNameFix) {
        toUpdate.push({
          id: match.id,
          action: csv.action,
          name: csv.name,
          csvAction: csv.action,
          dbAction: match.action,
          symbol: csv.symbol,
          time: csv.time,
        });
      }
    }
  }

  console.log(`=== MISSING (to insert): ${toInsert.length} ===`);
  for (const a of toInsert) {
    console.log(`  ${a.time} | ${a.symbol.padEnd(4)} | ${a.action.padEnd(4)} | ${a.price} | ${a.name}`);
  }

  console.log(`\n=== MISMATCHES (to update): ${toUpdate.length} ===`);
  for (const u of toUpdate) {
    console.log(`  ${u.time} | ${u.symbol.padEnd(4)} | DB: ${u.dbAction} -> CSV: ${u.csvAction} | name: ${u.name}`);
  }

  if (process.argv.includes('--apply')) {
    // Insert missing
    if (toInsert.length > 0) {
      const rows = toInsert.map(a => ({
        symbol: a.symbol,
        action: a.action,
        price: a.price,
        created_at: a.time,
        status: 'received',
        name: a.name || null,
        quantity: 1,
        raw_payload: JSON.stringify({ symbol: a.symbol, action: a.action, price: a.price, name: a.name, source: 'csv-sync' }),
      }));
      const { data: inserted, error: insertErr } = await supabase
        .from('alerts')
        .insert(rows)
        .select('id, symbol, action, price, created_at');
      if (insertErr) {
        console.error('\nInsert error:', insertErr.message);
      } else {
        console.log(`\nInserted ${inserted!.length} alerts`);
      }
    }

    // Update mismatches
    for (const u of toUpdate) {
      const updateFields: Record<string, string> = {};
      if (u.dbAction !== u.csvAction) updateFields.action = u.csvAction;
      if (u.name) updateFields.name = u.name;

      const { error: updateErr } = await supabase
        .from('alerts')
        .update(updateFields)
        .eq('id', u.id);
      if (updateErr) {
        console.error(`Update error for ${u.id}:`, updateErr.message);
      }
    }
    if (toUpdate.length > 0) {
      console.log(`Updated ${toUpdate.length} alerts`);
    }

    console.log('\nDone! Run without --apply to preview changes.');
  } else {
    console.log('\nDry run. Add --apply to execute changes.');
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
