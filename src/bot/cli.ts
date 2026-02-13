#!/usr/bin/env node
/* eslint-disable no-console */
// Bot CLI — entry point for `npm run bot`

import { BotRunner } from './runner';
import { getCurrentContractId } from '../services/topstepx/client';
import type { BotConfig } from './types';

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
  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const symbolsArg = getArg(args, '--symbols') ?? getArg(args, '--symbol') ?? 'ES';
  const symbols = symbolsArg.split(',').map((s) => s.trim().toUpperCase());
  const accountIdStr = getArg(args, '--account-id');
  const quantity = parseInt(getArg(args, '--quantity') ?? '1', 10);
  const maxContracts = parseInt(getArg(args, '--max-contracts') ?? '30', 10);
  const maxRetries = parseInt(getArg(args, '--max-retries') ?? '3', 10);
  const slBufferTicks = parseInt(getArg(args, '--sl-buffer') ?? '8', 10);

  if (!accountIdStr) {
    console.error('Usage: npm run bot -- --account-id <id> [--symbols MES,MNQ,MYM] [--quantity 1] [--max-contracts 30] [--max-retries 3] [--sl-buffer 8] [--dry-run]');
    console.error('  --symbols         Comma-separated list of symbols (default: ES)');
    console.error('  --symbol          Single symbol (backward compat, same as --symbols)');
    console.error('  --max-contracts   Max contracts in micro-equivalent units (default: 30)');
    console.error('  --max-retries     Max re-entry attempts after SL hit (default: 3)');
    console.error('  --sl-buffer       Fixed SL buffer in ticks (default: 8)');
    process.exit(1);
  }

  const accountId = parseInt(accountIdStr, 10);
  if (isNaN(accountId)) {
    console.error('Error: --account-id must be a number');
    process.exit(1);
  }

  // Load env vars from .env.local
  await loadEnv();

  // Resolve contract IDs for all symbols
  const contractIds = new Map<string, string>();
  for (const sym of symbols) {
    contractIds.set(sym, getCurrentContractId(sym));
  }

  const config: BotConfig = {
    accountId,
    contractIds,
    dryRun,
    writeIntervalMs: 5000,
    symbols,
    quantity,
    maxContracts,
    maxRetries,
    slBufferTicks,
  };

  const runner = new BotRunner(config);

  // Status display interval
  let statusInterval: ReturnType<typeof setInterval> | null = null;

  function renderStatus(): void {
    const status = runner.getStatus();
    const positions = runner.positions.getActivePositions();

    // ANSI escape: clear screen and move cursor to top
    process.stdout.write('\x1b[2J\x1b[H');

    console.log('╔══════════════════════════════════════════╗');
    console.log('║       TopstepX Bot — Live Status         ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log(`  Mode:         ${config.dryRun ? 'DRY-RUN' : 'LIVE'}`);
    console.log(`  Symbols:      ${config.symbols.join(', ')} (${config.symbols.length} contract${config.symbols.length > 1 ? 's' : ''})`);
    for (const [sym, cid] of config.contractIds.entries()) {
      console.log(`    ${sym}: ${cid}`);
    }
    console.log(`  Account:      ${config.accountId}`);
    console.log(`  Quantity:     ${config.quantity}`);
    console.log('');
    console.log(`  User Hub:     ${status.userHubConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`  Market Hub:   ${status.marketHubConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`  Positions:    ${status.activePositions}`);
    console.log(`  Pending DB:   ${status.pendingWrites}`);
    console.log('');

    if (positions.length > 0) {
      console.log('  -- Active Positions ---------------------');
      for (const pos of positions) {
        const pnl = pos.unrealizedPnl >= 0
          ? `+$${pos.unrealizedPnl.toFixed(2)}`
          : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`;
        console.log(`  ${pos.symbol} ${pos.side.toUpperCase()} | ${pos.state} | P&L: ${pnl} | SL: ${pos.currentSl}`);
      }
      console.log('');
    }

    console.log(`  Last update: ${new Date().toLocaleTimeString()}`);
    console.log('  Press Ctrl+C to stop');
  }

  // Graceful shutdown
  async function shutdown(): Promise<void> {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
    console.log('\nShutting down...');
    await runner.stop();
    process.exit(0);
  }

  process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
  process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });

  // Start
  console.log(`Starting bot for ${symbols.join(', ')} (${dryRun ? 'DRY-RUN' : 'LIVE'})...`);
  await runner.start();

  // Render status every second
  statusInterval = setInterval(renderStatus, 1000);
  renderStatus();
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
