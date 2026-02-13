import { describe, it, expect } from 'vitest';
import { evaluateTrailingStop } from './trailing-stop';

const baseLong = {
  side: 'long' as const,
  entryPrice: 18450,
  tp1Price: 18500,
  tp2Price: 18550,
  tp3Price: 18600,
};

const baseShort = {
  side: 'short' as const,
  entryPrice: 18550,
  tp1Price: 18500,
  tp2Price: 18450,
  tp3Price: 18400,
};

describe('evaluateTrailingStop', () => {
  describe('long positions', () => {
    it('should not change state when price is between entry and TP1', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'active',
        currentPrice: 18480,
        currentSl: 18425,
      });
      expect(result.newState).toBe('active');
      expect(result.slBreached).toBe(false);
      expect(result.tpHit).toBeNull();
    });

    it('should hit TP1 and move SL to entry', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'active',
        currentPrice: 18500,
        currentSl: 18425,
      });
      expect(result.newState).toBe('tp1_hit');
      expect(result.newSl).toBe(18450); // Entry = breakeven
      expect(result.tpHit).toBe('tp1');
      expect(result.slBreached).toBe(false);
    });

    it('should hit TP2 and move SL to TP1', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'tp1_hit',
        currentPrice: 18555,
        currentSl: 18450,
      });
      expect(result.newState).toBe('tp2_hit');
      expect(result.newSl).toBe(18500); // TP1
      expect(result.tpHit).toBe('tp2');
    });

    it('should hit TP3 and move SL to TP2', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'tp2_hit',
        currentPrice: 18610,
        currentSl: 18500,
      });
      expect(result.newState).toBe('tp3_hit');
      expect(result.newSl).toBe(18550); // TP2
      expect(result.tpHit).toBe('tp3');
    });

    it('should detect SL breach in active state', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'active',
        currentPrice: 18420,
        currentSl: 18425,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });

    it('should detect SL breach after TP1 (at breakeven)', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'tp1_hit',
        currentPrice: 18448,
        currentSl: 18450,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });

    it('should detect SL breach after TP2 (at TP1)', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'tp2_hit',
        currentPrice: 18498,
        currentSl: 18500,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });

    it('should detect SL breach after TP3 (at TP2)', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'tp3_hit',
        currentPrice: 18540,
        currentSl: 18550,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });

    it('should skip from active directly to TP2 if price jumps', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'active',
        currentPrice: 18560,
        currentSl: 18425,
      });
      // Should hit TP3 first since it checks highest TP first
      expect(result.tpHit).not.toBeNull();
    });
  });

  describe('short positions', () => {
    it('should not change state when price is between entry and TP1', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'active',
        currentPrice: 18520,
        currentSl: 18575,
      });
      expect(result.newState).toBe('active');
      expect(result.slBreached).toBe(false);
      expect(result.tpHit).toBeNull();
    });

    it('should hit TP1 and move SL to entry', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'active',
        currentPrice: 18500,
        currentSl: 18575,
      });
      expect(result.newState).toBe('tp1_hit');
      expect(result.newSl).toBe(18550); // Entry = breakeven
      expect(result.tpHit).toBe('tp1');
    });

    it('should hit TP2 and move SL to TP1', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'tp1_hit',
        currentPrice: 18445,
        currentSl: 18550,
      });
      expect(result.newState).toBe('tp2_hit');
      expect(result.newSl).toBe(18500); // TP1
      expect(result.tpHit).toBe('tp2');
    });

    it('should hit TP3 and move SL to TP2', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'tp2_hit',
        currentPrice: 18395,
        currentSl: 18500,
      });
      expect(result.newState).toBe('tp3_hit');
      expect(result.newSl).toBe(18450); // TP2
      expect(result.tpHit).toBe('tp3');
    });

    it('should detect SL breach for short (price goes up)', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'active',
        currentPrice: 18580,
        currentSl: 18575,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });

    it('should detect SL breach after TP1 for short', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'tp1_hit',
        currentPrice: 18555,
        currentSl: 18550,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(true);
    });
  });

  describe('non-active states', () => {
    it('should return unchanged for pending_entry', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'pending_entry',
        currentPrice: 18600,
        currentSl: 18425,
      });
      expect(result.newState).toBe('pending_entry');
      expect(result.slBreached).toBe(false);
      expect(result.tpHit).toBeNull();
    });

    it('should return unchanged for closed', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'closed',
        currentPrice: 18600,
        currentSl: 18425,
      });
      expect(result.newState).toBe('closed');
      expect(result.slBreached).toBe(false);
    });

    it('should return unchanged for cancelled', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'cancelled',
        currentPrice: 18600,
        currentSl: 18425,
      });
      expect(result.newState).toBe('cancelled');
      expect(result.slBreached).toBe(false);
    });
  });

  describe('SL at exact price', () => {
    it('should breach when price equals SL for long', () => {
      const result = evaluateTrailingStop({
        ...baseLong,
        state: 'active',
        currentPrice: 18425,
        currentSl: 18425,
      });
      expect(result.slBreached).toBe(true);
    });

    it('should breach when price equals SL for short', () => {
      const result = evaluateTrailingStop({
        ...baseShort,
        state: 'active',
        currentPrice: 18575,
        currentSl: 18575,
      });
      expect(result.slBreached).toBe(true);
    });
  });
});
