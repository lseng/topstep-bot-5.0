import { describe, it, expect } from 'vitest';

/**
 * Test CLI parsing logic for multi-symbol support.
 * Since the CLI is a top-level script, we test the parsing logic directly.
 */

/** Simulates the CLI symbol parsing logic from src/bot/cli.ts */
function parseSymbols(args: string[]): string[] {
  const getArg = (argv: string[], flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const symbolsArg = getArg(args, '--symbols') ?? getArg(args, '--symbol') ?? 'ES';
  return symbolsArg.split(',').map((s) => s.trim().toUpperCase());
}

describe('CLI multi-symbol parsing', () => {
  it('parses --symbols with multiple symbols', () => {
    const symbols = parseSymbols(['--symbols', 'MES,MNQ,MYM']);
    expect(symbols).toEqual(['MES', 'MNQ', 'MYM']);
  });

  it('parses --symbols with all 6 micro symbols', () => {
    const symbols = parseSymbols(['--symbols', 'MES,MNQ,MYM,MGC,MCL,MBT']);
    expect(symbols).toEqual(['MES', 'MNQ', 'MYM', 'MGC', 'MCL', 'MBT']);
  });

  it('backward compat: --symbol single value', () => {
    const symbols = parseSymbols(['--symbol', 'ES']);
    expect(symbols).toEqual(['ES']);
  });

  it('defaults to ES when no flag provided', () => {
    const symbols = parseSymbols([]);
    expect(symbols).toEqual(['ES']);
  });

  it('--symbols takes priority over --symbol', () => {
    const symbols = parseSymbols(['--symbol', 'ES', '--symbols', 'MES,MNQ']);
    expect(symbols).toEqual(['MES', 'MNQ']);
  });

  it('uppercases symbols', () => {
    const symbols = parseSymbols(['--symbols', 'mes,mnq']);
    expect(symbols).toEqual(['MES', 'MNQ']);
  });

  it('trims whitespace from symbols', () => {
    const symbols = parseSymbols(['--symbols', ' MES , MNQ , MYM ']);
    expect(symbols).toEqual(['MES', 'MNQ', 'MYM']);
  });

  it('handles single symbol in --symbols', () => {
    const symbols = parseSymbols(['--symbols', 'MGC']);
    expect(symbols).toEqual(['MGC']);
  });
});
