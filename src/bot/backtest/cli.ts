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
  const quantity = parseInt(getArg(args, '--quantity') ?? '1', 10);
  const maxContracts = parseInt(getArg(args, '--max-contracts') ?? '0', 10);
  const maxRetries = parseInt(getArg(args, '--max-retries') ?? '0', 10);
  const slBufferTicks = parseInt(getArg(args, '--sl-buffer') ?? '0', 10);
  const alertName = getArg(args, '--alert-name');

  if (!fromDate || !toDate) {
    console.error('Usage: npm run backtest -- --from <date> --to <date> [--symbols MES,MNQ] [--verbose] [--quantity 1] [--max-contracts 30] [--max-retries 3] [--sl-buffer 8] [--alert-name <name>]');
    console.error('  Dates should be ISO 8601 format (e.g. 2026-01-01)');
    console.error('  --symbols         Comma-separated list of symbols (default: ES)');
    console.error('  --symbol          Single symbol (backward compat)');
    console.error('  --max-contracts   Max contracts in micro-equivalent units (0 = unlimited, default: 0)');
    console.error('  --max-retries     Max re-entry attempts after SL hit (0 = disabled, default: 0)');
    console.error('  --sl-buffer       Fixed SL buffer in ticks (0 = mirrored TP1, default: 0)');
    console.error('  --alert-name      Filter alerts by name (e.g. "day-trader-medium-term-13")');
    process.exit(1);
  }

  await loadEnv();

  const config: BacktestConfig = {
    fromDate,
    toDate,
    symbols,
    quantity,
    verbose,
    maxContracts,
    maxRetries,
    slBufferTicks,
    alertName,
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
