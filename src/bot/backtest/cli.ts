/* eslint-disable no-console */
// Backtest CLI — entry point for `npm run backtest`

import { runBacktest } from './engine';
import { formatBacktestReport } from './reporter';
import type { BacktestConfig } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

async function loadEnv(): Promise<void> {
  try {
    const { readFileSync } = await import('fs');
    const envContent = readFileSync('.env.local', 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local not required if env vars are already set
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const symbolsArg = getArg(args, '--symbols') ?? getArg(args, '--symbol') ?? 'ES';
  const symbols = symbolsArg.split(',').map((s) => s.trim().toUpperCase());
  const fromDate = getArg(args, '--from');
  const toDate = getArg(args, '--to');
  const verbose = args.includes('--verbose');
  const slBufferTicks = parseInt(getArg(args, '--sl-buffer') ?? '8', 10);
  const quantity = parseInt(getArg(args, '--quantity') ?? '1', 10);

  if (!fromDate || !toDate) {
    console.error('Usage: npm run backtest -- --from <date> --to <date> [--symbols MES,MNQ] [--verbose] [--sl-buffer 8] [--quantity 1]');
    console.error('  Dates should be ISO 8601 format (e.g. 2026-01-01)');
    console.error('  --symbols  Comma-separated list of symbols (default: ES)');
    console.error('  --symbol   Single symbol (backward compat)');
    process.exit(1);
  }

  await loadEnv();

  const config: BacktestConfig = {
    fromDate,
    toDate,
    symbols,
    slBufferTicks,
    quantity,
    verbose,
  };

  console.log(`Running backtest for ${symbols.join(', ')} from ${fromDate} to ${toDate}...`);

  const result = await runBacktest(config);
  const report = formatBacktestReport(result);

  console.log(report);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
