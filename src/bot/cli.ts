#!/usr/bin/env node
/* eslint-disable no-console */
// Bot CLI -- entry point for `npm run bot`
// Supports both single-account and multi-account modes

import { BotRunner } from './runner';
import { getCurrentContractId } from '../services/topstepx/client';
import type { BotConfig, AccountStrategyConfig } from './types';

// --- Helpers ---

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

/**
 * Parse multi-account args from CLI.
 * Supports repeated --account flags with per-account overrides.
 * --alert-name is optional (not needed for SFX mode).
 *
 * Example:
 *   --account 18206926 --sl-buffer 8 --max-retries 3
 *   --account 18801458 --symbols MES,MNQ,MYM,MGC,MNG,MBT --sl-buffer 8 --max-retries 1
 *   --max-contracts 30 --dry-run
 */
function parseMultiAccountArgs(args: string[], globalDefaults: {
  maxContracts: number;
  maxRetries: number;
  slBufferTicks: number;
}): AccountStrategyConfig[] {
  const accounts: AccountStrategyConfig[] = [];
  let i = 0;

  while (i < args.length) {
    if (args[i] === '--account' && i + 1 < args.length) {
      const accountId = parseInt(args[i + 1], 10);
      if (isNaN(accountId)) {
        i += 2;
        continue;
      }

      // Start parsing per-account flags
      i += 2;
      let alertName: string | undefined;
      let slBufferTicks = globalDefaults.slBufferTicks;
      let maxRetries = globalDefaults.maxRetries;
      let maxContracts = globalDefaults.maxContracts;
      let symbols: string[] | undefined;

      // Consume per-account flags until we hit another --account or end
      while (i < args.length && args[i] !== '--account') {
        if (args[i] === '--alert-name' && i + 1 < args.length) {
          alertName = args[i + 1];
          i += 2;
        } else if (args[i] === '--sl-buffer' && i + 1 < args.length) {
          slBufferTicks = parseInt(args[i + 1], 10);
          i += 2;
        } else if (args[i] === '--max-retries' && i + 1 < args.length) {
          maxRetries = parseInt(args[i + 1], 10);
          i += 2;
        } else if (args[i] === '--max-contracts' && i + 1 < args.length) {
          maxContracts = parseInt(args[i + 1], 10);
          i += 2;
        } else if (args[i] === '--symbols' && i + 1 < args.length) {
          symbols = args[i + 1].split(',').map((s) => s.trim().toUpperCase());
          i += 2;
        } else {
          // Skip unknown flags (they're global)
          i++;
        }
      }

      accounts.push({ accountId, alertName, slBufferTicks, maxRetries, maxContracts, symbols });
    } else {
      i++;
    }
  }

  return accounts;
}

// --- Main ---

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const symbolsArg = getArg(args, '--symbols') ?? getArg(args, '--symbol');
  const symbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim().toUpperCase())
    : []; // Empty = accept all known symbols dynamically
  const quantity = parseInt(getArg(args, '--quantity') ?? '1', 10);
  const maxContracts = parseInt(getArg(args, '--max-contracts') ?? '30', 10);
  const maxRetries = parseInt(getArg(args, '--max-retries') ?? '3', 10);
  const slBufferTicks = parseInt(getArg(args, '--sl-buffer') ?? '8', 10);
  const syncIntervalMs = parseInt(getArg(args, '--sync-interval') ?? '60000', 10);

  // Check for multi-account mode: repeated --account flags
  const multiAccounts = parseMultiAccountArgs(args, { maxContracts, maxRetries, slBufferTicks });

  // Single-account mode: --account-id (backward compat)
  const accountIdStr = getArg(args, '--account-id');

  // Also support single account via --account with --alert-name
  if (multiAccounts.length === 0 && !accountIdStr) {
    console.error('Usage (single account):');
    console.error('  npm run bot -- --account-id <id> [--symbols MES,MNQ] [--dry-run]');
    console.error('');
    console.error('Usage (multi-account):');
    console.error('  npm run bot -- \\');
    console.error('    --account 18206926 --sl-buffer 8 --max-retries 3 \\');
    console.error('    --account 18801458 --symbols MES,MNQ,MYM,MGC,MNG,MBT --sl-buffer 8 \\');
    console.error('    --max-contracts 30 --dry-run');
    console.error('');
    console.error('Global flags: --symbols, --quantity, --max-contracts, --max-retries,');
    console.error('  --sl-buffer, --sync-interval, --dry-run');
    console.error('Per-account flags (after --account): --alert-name, --sl-buffer, --max-retries, --max-contracts, --symbols');
    process.exit(1);
  }

  // Load env vars from .env.local
  await loadEnv();

  // Resolve contract IDs for specified symbols (if any)
  const contractIds = new Map<string, string>();
  for (const sym of symbols) {
    contractIds.set(sym, getCurrentContractId(sym));
  }

  let config: BotConfig;

  if (multiAccounts.length > 0) {
    // Multi-account mode
    const primaryAccountId = multiAccounts[0].accountId;

    config = {
      accountId: primaryAccountId,
      contractIds,
      dryRun,
      writeIntervalMs: 5000,
      symbols,
      quantity,
      maxContracts,
      maxRetries,
      slBufferTicks,
      syncIntervalMs,
      accounts: multiAccounts,
    };

    console.log(`Multi-account mode: ${multiAccounts.length} accounts`);
    for (const acct of multiAccounts) {
      const symbolsLabel = acct.symbols ? ` [${acct.symbols.join(',')}]` : ' [all symbols]';
      const alertLabel = acct.alertName ? ` alert="${acct.alertName}"` : '';
      console.log(`  Account ${acct.accountId}${alertLabel}${symbolsLabel} (SL buffer: ${acct.slBufferTicks}, retries: ${acct.maxRetries})`);
    }
  } else {
    // Single-account mode
    const accountId = parseInt(accountIdStr!, 10);
    if (isNaN(accountId)) {
      console.error('Error: --account-id must be a number');
      process.exit(1);
    }

    // Optional alert-name for single account filtering
    const alertName = getArg(args, '--alert-name');

    config = {
      accountId,
      contractIds,
      dryRun,
      writeIntervalMs: 5000,
      symbols,
      quantity,
      maxContracts,
      maxRetries,
      slBufferTicks,
      syncIntervalMs,
    };

    // If alert-name is specified in single-account mode, use multi-account routing
    if (alertName) {
      config.accounts = [{
        accountId,
        alertName,
        slBufferTicks,
        maxRetries,
        maxContracts,
      }];
    }
  }

  const runner = new BotRunner(config);

  // Status display interval
  let statusInterval: ReturnType<typeof setInterval> | null = null;

  function renderStatus(): void {
    const status = runner.getStatus();

    // ANSI escape: clear screen and move cursor to top
    process.stdout.write('\x1b[2J\x1b[H');

    console.log('==== TopstepX Bot (SFX Algo) -- Live Status ====');
    console.log('');
    console.log(`  Mode:         ${config.dryRun ? 'DRY-RUN' : 'LIVE'}${status.multiAccountMode ? ' (multi-account)' : ''}`);
    console.log(`  Signal Source: sfx_algo_alerts (Supabase Realtime)`);
    const symbolsLabel = config.symbols.length > 0
      ? `${config.symbols.join(', ')} (${config.symbols.length} symbol${config.symbols.length > 1 ? 's' : ''})`
      : 'Dynamic (all known symbols)';
    console.log(`  Symbols:      ${symbolsLabel}`);
    for (const [sym, cid] of config.contractIds.entries()) {
      console.log(`    ${sym}: ${cid}`);
    }
    console.log(`  Accounts:     ${status.accountIds.join(', ')}`);
    console.log(`  Quantity:     ${config.quantity}`);
    console.log('');
    console.log(`  User Hub:     ${status.userHubConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`  Market Hub:   ${status.marketHubConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`  Positions:    ${status.activePositions}`);
    console.log(`  Pending DB:   ${status.pendingWrites}`);
    console.log('');

    // Show per-account positions
    for (const acctId of status.accountIds) {
      const pm = runner.getPositionManager(acctId);
      if (!pm) continue;
      const positions = pm.getActivePositions();
      if (positions.length > 0) {
        console.log(`  -- Account ${acctId} Positions --`);
        for (const pos of positions) {
          const pnl = pos.unrealizedPnl >= 0
            ? `+$${pos.unrealizedPnl.toFixed(2)}`
            : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`;
          console.log(`  ${pos.symbol} ${pos.side.toUpperCase()} | ${pos.state} | P&L: ${pnl} | SL: ${pos.currentSl}`);
        }
        console.log('');
      }
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
  const symbolsDisplay = symbols.length > 0 ? symbols.join(', ') : 'all known symbols (dynamic)';
  console.log(`Starting SFX bot for ${symbolsDisplay} (${dryRun ? 'DRY-RUN' : 'LIVE'})...`);
  await runner.start();

  // Render status every second
  statusInterval = setInterval(renderStatus, 1000);
  renderStatus();
}

// Prevent unhandled errors from crashing the process
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`[unhandledRejection] ${msg}`);
});

process.on('uncaughtException', (err: Error) => {
  console.error(`[uncaughtException] ${err.message}`);
  // Don't exit — keep the bot alive unless it's truly fatal
});

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
