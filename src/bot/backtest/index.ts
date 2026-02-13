// Backtest module — barrel export

export { runBacktest, aggregateResults } from './engine';
export { simulateTrade } from './simulator';
export { formatBacktestReport } from './reporter';
export type { BacktestConfig, BacktestResult, SimulatedTrade } from './types';
