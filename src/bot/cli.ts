/* eslint-disable no-console */
// Bot CLI — Entry point for `npm run bot`
// Interactive terminal with live position status

import { BotRunner } from './runner';
import type { BotConfig } from './types';

function parseArgs(): BotConfig {
  const args = process.argv.slice(2);
  const config: BotConfig = {
    accountId: 0,
    contractId: '',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--account-id':
        config.accountId = parseInt(args[++i], 10);
        break;
      case '--contract-id':
        config.contractId = args[++i];
        break;
    }
  }

  // Fallback to env vars
  if (!config.accountId) {
    config.accountId = parseInt(process.env.TOPSTEPX_ACCOUNT_ID ?? '0', 10);
  }
  if (!config.contractId) {
    config.contractId = process.env.TOPSTEPX_CONTRACT_ID ?? 'CON.F.US.ENQ.M25';
  }

  return config;
}

function displayStatus(runner: BotRunner): void {
  const status = runner.getStatus();
  const pm = runner.getPositionManager();
  const active = pm.getActivePositions();

  process.stdout.write('\x1B[2J\x1B[H'); // Clear screen
  console.log('=== TopstepX Trading Bot ===');
  console.log(`Status: ${status.running ? 'RUNNING' : 'STOPPED'}`);
  console.log(`Active Positions: ${status.activePositions}`);
  console.log(`Total Positions: ${status.totalPositions}`);
  console.log('');

  if (active.length > 0) {
    console.log('--- Active Positions ---');
    for (const pos of active) {
      const pnl = pos.unrealizedPnl >= 0 ? `+${pos.unrealizedPnl.toFixed(2)}` : pos.unrealizedPnl.toFixed(2);
      console.log(
        `  ${pos.symbol} ${pos.side.toUpperCase()} x${pos.quantity} | ` +
        `State: ${pos.state} | Entry: ${pos.entryPrice ?? pos.targetEntryPrice} | ` +
        `SL: ${pos.currentSl} | P&L: ${pnl}`
      );
    }
  }

  console.log('');
  console.log('Press Ctrl+C to stop');
}

async function main(): Promise<void> {
  const config = parseArgs();

  console.log(`Starting bot (dry-run: ${config.dryRun}, account: ${config.accountId}, contract: ${config.contractId})`);

  const runner = new BotRunner(config);

  // Position event logging
  runner.onEvent((event) => {
    console.log(`[EVENT] ${event.type}:`, JSON.stringify(event));
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('\nShutting down...');
    await runner.stop();
    console.log('Bot stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await runner.start();

  // Live status display
  const statusInterval = setInterval(() => displayStatus(runner), 2000);

  // Keep alive
  await new Promise<void>((resolve) => {
    process.on('exit', () => {
      clearInterval(statusInterval);
      resolve();
    });
  });
}

void main().catch(console.error);
