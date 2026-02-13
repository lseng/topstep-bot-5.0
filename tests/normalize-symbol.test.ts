import { describe, it, expect } from 'vitest';
import { normalizeSymbol } from '../src/lib/validation';

describe('normalizeSymbol', () => {
  it('strips TradingView continuous contract suffix (1!)', () => {
    expect(normalizeSymbol('MES1!')).toBe('MES');
    expect(normalizeSymbol('NQ1!')).toBe('NQ');
    expect(normalizeSymbol('MGC1!')).toBe('MGC');
    expect(normalizeSymbol('MCL1!')).toBe('MCL');
    expect(normalizeSymbol('MBT1!')).toBe('MBT');
    expect(normalizeSymbol('ES1!')).toBe('ES');
    expect(normalizeSymbol('MYM1!')).toBe('MYM');
    expect(normalizeSymbol('CL1!')).toBe('CL');
    expect(normalizeSymbol('NG1!')).toBe('NG');
    expect(normalizeSymbol('YM1!')).toBe('YM');
  });

  it('strips second continuous contract suffix (2!)', () => {
    expect(normalizeSymbol('ES2!')).toBe('ES');
    expect(normalizeSymbol('NQ2!')).toBe('NQ');
  });

  it('strips higher continuous contract suffixes', () => {
    expect(normalizeSymbol('ES3!')).toBe('ES');
    expect(normalizeSymbol('MES10!')).toBe('MES');
  });

  it('leaves clean symbols unchanged', () => {
    expect(normalizeSymbol('MES')).toBe('MES');
    expect(normalizeSymbol('ES')).toBe('ES');
    expect(normalizeSymbol('NQ')).toBe('NQ');
    expect(normalizeSymbol('AAPL')).toBe('AAPL');
  });

  it('converts to uppercase', () => {
    expect(normalizeSymbol('mes1!')).toBe('MES');
    expect(normalizeSymbol('es')).toBe('ES');
    expect(normalizeSymbol('nq2!')).toBe('NQ');
  });

  it('trims whitespace', () => {
    expect(normalizeSymbol('  MES1!  ')).toBe('MES');
    expect(normalizeSymbol(' ES ')).toBe('ES');
  });

  it('handles edge cases', () => {
    // Just exclamation mark (no digits before it) — not a TV suffix pattern
    expect(normalizeSymbol('MES!')).toBe('MES!');
    // Just digits (no exclamation mark) — not a TV suffix pattern
    expect(normalizeSymbol('MES1')).toBe('MES1');
  });
});
