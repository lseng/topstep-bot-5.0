import { describe, it, expect } from 'vitest';
import { parseSfxAlgoAlert } from '../src/services/sfx-algo-parser';

describe('parseSfxAlgoAlert', () => {
  it('parses a buy entry alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'ES1!',
      alert: 'buy',
      signal_direction: 'bull',
      close: 6877.75,
      current_rating: '2',
      tp1: '6878',
      tp2: '6882.5',
      tp3: '6887',
      sl: '6859',
      unix_time: 1771230000000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).toEqual({
      ticker: 'ES1!',
      symbol: 'ES',
      alertType: 'buy',
      signalDirection: 'bull',
      price: 6877.75,
      currentRating: 2,
      tp1: 6878,
      tp2: 6882.5,
      tp3: 6887,
      stopLoss: 6859,
      entryPrice: null,
      unixTime: 1771230000000,
    });
  });

  it('parses a sell entry alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'NQ1!',
      alert: 'sell',
      signal_direction: 'bear',
      close: 24700,
      current_rating: '1',
      tp1: '24680',
      tp2: '24650',
      tp3: '24600',
      sl: '24750',
      unix_time: 1771230060000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe('sell');
    expect(result!.signalDirection).toBe('bear');
    expect(result!.symbol).toBe('NQ');
    expect(result!.stopLoss).toBe(24750);
    expect(result!.entryPrice).toBeNull();
  });

  it('parses a TP1 exit alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'CL1!',
      alert: 'TP1',
      signal_direction: 'bull',
      close: 63.36,
      entry_price: '63.05',
      unix_time: 1771231000000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe('TP1');
    expect(result!.entryPrice).toBe(63.05);
    expect(result!.tp1).toBeNull();
    expect(result!.tp2).toBeNull();
    expect(result!.tp3).toBeNull();
    expect(result!.stopLoss).toBeNull();
    expect(result!.currentRating).toBeNull();
  });

  it('parses a TP2 exit alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'MES1!',
      alert: 'TP2',
      signal_direction: 'bear',
      close: 6840,
      entry_price: '6870',
      unix_time: 1771232000000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe('TP2');
    expect(result!.symbol).toBe('MES');
    expect(result!.entryPrice).toBe(6870);
  });

  it('parses a TP3 exit alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'YM1!',
      alert: 'TP3',
      signal_direction: 'bull',
      close: 49700,
      entry_price: '49600',
      unix_time: 1771233000000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe('TP3');
    expect(result!.entryPrice).toBe(49600);
  });

  it('parses a stop-loss exit alert', () => {
    const raw = JSON.stringify({
      algorithm: 'SFX',
      ticker: 'MGC1!',
      alert: 'sl',
      signal_direction: 'bear',
      close: 5084.5,
      entry_price: 5038.5,
      unix_time: 1771234000000,
    });

    const result = parseSfxAlgoAlert(raw);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe('sl');
    expect(result!.entryPrice).toBe(5038.5);
    expect(result!.symbol).toBe('MGC');
  });

  it('normalizes ticker symbols correctly', () => {
    const tickers = ['ES1!', 'NQ1!', 'MES1!', 'MNQ1!', 'CL1!', 'MBT1!', 'MNG1!'];
    const expected = ['ES', 'NQ', 'MES', 'MNQ', 'CL', 'MBT', 'MNG'];

    for (let i = 0; i < tickers.length; i++) {
      const raw = JSON.stringify({
        algorithm: 'SFX',
        ticker: tickers[i],
        alert: 'buy',
        signal_direction: 'bull',
        close: 100,
        current_rating: '1',
        tp1: '101',
        tp2: '102',
        tp3: '103',
        sl: '99',
        unix_time: 1771230000000,
      });
      const result = parseSfxAlgoAlert(raw);
      expect(result!.symbol).toBe(expected[i]);
    }
  });

  it('returns null for invalid JSON', () => {
    expect(parseSfxAlgoAlert('not json')).toBeNull();
  });

  it('returns null for non-SFX algorithm', () => {
    const raw = JSON.stringify({ algorithm: 'OTHER', ticker: 'ES1!', alert: 'buy' });
    expect(parseSfxAlgoAlert(raw)).toBeNull();
  });

  it('returns null for invalid alert type', () => {
    const raw = JSON.stringify({ algorithm: 'SFX', ticker: 'ES1!', alert: 'invalid' });
    expect(parseSfxAlgoAlert(raw)).toBeNull();
  });

  it('returns null for missing ticker', () => {
    const raw = JSON.stringify({ algorithm: 'SFX', alert: 'buy' });
    expect(parseSfxAlgoAlert(raw)).toBeNull();
  });
});
