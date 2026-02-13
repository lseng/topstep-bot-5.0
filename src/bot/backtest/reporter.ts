// Backtest Reporter — Format results for terminal output

import type { BacktestResult } from './types';

export function formatBacktestReport(result: BacktestResult): string {
  const lines: string[] = [];

  lines.push('=== Backtest Results ===');
  lines.push('');
  lines.push(`Total Trades:    ${result.totalTrades}`);
  lines.push(`Winning Trades:  ${result.winningTrades}`);
  lines.push(`Losing Trades:   ${result.losingTrades}`);
  lines.push(`Win Rate:        ${result.winRate.toFixed(1)}%`);
  lines.push('');
  lines.push(`Total P&L:       ${formatPnl(result.totalPnl)}`);
  lines.push(`Average P&L:     ${formatPnl(result.avgPnl)}`);
  lines.push(`Profit Factor:   ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}`);
  lines.push(`Largest Win:     ${formatPnl(result.largestWin)}`);
  lines.push(`Largest Loss:    ${formatPnl(result.largestLoss)}`);
  lines.push('');

  if (result.trades.length > 0) {
    lines.push('--- Trade Breakdown ---');
    lines.push(padRight('Alert', 10) + padRight('Symbol', 8) + padRight('Side', 7) + padRight('Entry', 12) + padRight('Exit', 12) + padRight('P&L', 12) + 'Reason');
    lines.push('-'.repeat(73));

    for (const trade of result.trades) {
      lines.push(
        padRight(trade.alertId.substring(0, 8), 10) +
        padRight(trade.symbol, 8) +
        padRight(trade.side, 7) +
        padRight(trade.entryPrice.toFixed(2), 12) +
        padRight(trade.exitPrice.toFixed(2), 12) +
        padRight(formatPnl(trade.grossPnl), 12) +
        trade.exitReason
      );
    }
  }

  return lines.join('\n');
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}
