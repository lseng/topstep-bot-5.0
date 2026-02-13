/* eslint-disable no-console */
// Backtest CLI — Entry point for `npm run backtest`

import { getSupabase } from '../../lib/supabase';
import { TopstepXClient } from '../../services/topstepx/client';
import { BacktestEngine } from './engine';
import { formatBacktestReport } from './reporter';
import type { BacktestConfig } from './types';

function parseArgs(): BacktestConfig {
  const args = process.argv.slice(2);
  const config: BacktestConfig = {
    contractId: process.env.TOPSTEPX_CONTRACT_ID ?? 'CON.F.US.ENQ.M25',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--symbol':
        config.symbol = args[++i];
        break;
      case '--from':
        config.fromDate = args[++i];
        break;
      case '--to':
        config.toDate = args[++i];
        break;
      case '--contract-id':
        config.contractId = args[++i];
        break;
    }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs();

  console.log('Starting backtest...');
  if (config.symbol) console.log(`Symbol: ${config.symbol}`);
  if (config.fromDate) console.log(`From: ${config.fromDate}`);
  if (config.toDate) console.log(`To: ${config.toDate}`);
  console.log('');

  const supabase = getSupabase();
  const client = new TopstepXClient({
    baseUrl: process.env.TOPSTEPX_BASE_URL ?? 'https://gateway.projectx.com',
    username: process.env.TOPSTEPX_USERNAME ?? '',
    apiKey: process.env.TOPSTEPX_API_KEY ?? '',
  });

  const engine = new BacktestEngine(supabase, client);
  const result = await engine.run(config);

  console.log(formatBacktestReport(result));
}

void main().catch(console.error);
