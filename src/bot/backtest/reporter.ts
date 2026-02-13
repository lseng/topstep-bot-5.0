// Backtest reporter — formats results for terminal output

import type { BacktestResult, SimulatedTrade } from './types';

/**
 * Format a backtest result for terminal output.
 *
 * Includes: summary stats, per-trade breakdown, P&L curve (ASCII).
 */
export function formatBacktestReport(result: BacktestResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('========================================');
  lines.push('         BACKTEST RESULTS');
  lines.push('========================================');
  lines.push('');

  // Config summary
  lines.push(`  Symbols:      ${result.config.symbols.join(', ')}`);
  lines.push(`  Period:       ${result.config.fromDate} to ${result.config.toDate}`);
  lines.push(`  SL Buffer:    ${result.config.slBufferTicks} ticks`);
  lines.push(`  Quantity:     ${result.config.quantity} contracts`);
  lines.push('');

  // Key stats
  lines.push('--- Summary ---');
  lines.push(`  Alerts evaluated:  ${result.alertsEvaluated}`);
  lines.push(`  Trades taken:      ${result.tradesTaken}`);
  lines.push(`  Wins / Losses:     ${result.wins} / ${result.losses}`);
  lines.push(`  Win rate:          ${result.winRate.toFixed(1)}%`);
  lines.push('');
  lines.push(`  Total gross P&L:   ${formatPnl(result.totalGrossPnl)}`);
  lines.push(`  Total net P&L:     ${formatPnl(result.totalNetPnl)}`);
  lines.push(`  Avg net P&L:       ${formatPnl(result.avgNetPnl)}`);
  lines.push(`  Profit factor:     ${result.profitFactor === Infinity ? 'Inf' : result.profitFactor.toFixed(2)}`);
  lines.push(`  Sharpe ratio:      ${result.sharpeRatio.toFixed(2)}`);
  lines.push(`  Max drawdown:      ${formatPnl(-result.maxDrawdown)}`);
  lines.push('');

  // Per-symbol breakdown (only if multiple symbols)
  const symbolSet = new Set(result.trades.filter((t) => t.entryFilled).map((t) => t.symbol));
  if (symbolSet.size > 1) {
    lines.push('--- Per-Symbol Breakdown ---');
    for (const sym of symbolSet) {
      const symTrades = result.trades.filter((t) => t.entryFilled && t.symbol === sym);
      const symWins = symTrades.filter((t) => t.netPnl > 0).length;
      const symPnl = symTrades.reduce((sum, t) => sum + t.netPnl, 0);
      const symWinRate = symTrades.length > 0 ? ((symWins / symTrades.length) * 100).toFixed(1) : '0.0';
      lines.push(`  ${padRight(sym, 6)} ${padRight(String(symTrades.length) + ' trades', 12)} WR: ${symWinRate}%  P&L: ${formatPnl(symPnl)}`);
    }
    lines.push('');
  }

  // Per-trade breakdown
  if (result.trades.length > 0 && result.config.verbose) {
    lines.push('--- Trade Breakdown ---');
    lines.push(
      padRight('#', 4) +
      padRight('Side', 6) +
      padRight('Entry', 10) +
      padRight('Exit', 10) +
      padRight('P&L', 12) +
      padRight('Reason', 24) +
      'TP Hit',
    );
    lines.push('-'.repeat(70));

    const filledTrades = result.trades.filter((t) => t.entryFilled);
    for (let i = 0; i < filledTrades.length; i++) {
      const t = filledTrades[i];
      lines.push(
        padRight(String(i + 1), 4) +
        padRight(t.side.toUpperCase(), 6) +
        padRight(t.entryPrice.toFixed(2), 10) +
        padRight(t.exitPrice.toFixed(2), 10) +
        padRight(formatPnl(t.netPnl), 12) +
        padRight(t.exitReason, 24) +
        (t.highestTpHit ?? '-'),
      );
    }
    lines.push('');
  }

  // P&L curve (ASCII)
  if (result.tradesTaken > 1) {
    lines.push('--- Equity Curve ---');
    lines.push(renderEquityCurve(result.trades.filter((t) => t.entryFilled)));
    lines.push('');
  }

  lines.push('========================================');
  lines.push('');

  return lines.join('\n');
}

/** Format a P&L value with sign and dollar sign */
function formatPnl(value: number): string {
  if (value >= 0) {
    return `+$${value.toFixed(2)}`;
  }
  return `-$${Math.abs(value).toFixed(2)}`;
}

/** Pad a string to a fixed width (right-padded) */
function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/** Render a simple ASCII equity curve */
function renderEquityCurve(trades: SimulatedTrade[]): string {
  if (trades.length === 0) return '  (no trades)';

  const HEIGHT = 10;
  const WIDTH = Math.min(trades.length, 60);

  // Build cumulative P&L series
  const cumPnl: number[] = [];
  let running = 0;
  for (const t of trades) {
    running += t.netPnl;
    cumPnl.push(running);
  }

  // Resample if more trades than width
  const sampled: number[] = [];
  if (cumPnl.length <= WIDTH) {
    sampled.push(...cumPnl);
  } else {
    for (let i = 0; i < WIDTH; i++) {
      const idx = Math.round((i / (WIDTH - 1)) * (cumPnl.length - 1));
      sampled.push(cumPnl[idx]);
    }
  }

  const maxVal = Math.max(...sampled, 0);
  const minVal = Math.min(...sampled, 0);
  const range = maxVal - minVal || 1;

  // Build grid
  const grid: string[][] = [];
  for (let row = 0; row < HEIGHT; row++) {
    grid.push(new Array<string>(sampled.length).fill(' '));
  }

  for (let col = 0; col < sampled.length; col++) {
    const normalized = (sampled[col] - minVal) / range;
    const row = HEIGHT - 1 - Math.round(normalized * (HEIGHT - 1));
    grid[row][col] = sampled[col] >= 0 ? '+' : '-';
  }

  // Render with Y-axis labels
  const lines: string[] = [];
  for (let row = 0; row < HEIGHT; row++) {
    const yValue = maxVal - (row / (HEIGHT - 1)) * range;
    const label = padRight(formatPnl(yValue), 12);
    lines.push(`  ${label} |${grid[row].join('')}`);
  }
  lines.push(`  ${padRight('', 12)} +${'─'.repeat(sampled.length)}`);

  return lines.join('\n');
}
