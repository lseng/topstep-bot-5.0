import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONTRACT_SPECS, EXPIRY_CODES } from '../src/services/topstepx/types';
import { getCurrentContractId } from '../src/services/topstepx/client';

// Mock logger to suppress output
vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CONTRACT_SPECS', () => {
  const allSymbols = ['ES', 'NQ', 'MES', 'MNQ', 'MYM', 'MGC', 'MCL', 'MBT'];

  it('has entries for all expected symbols', () => {
    for (const sym of allSymbols) {
      expect(CONTRACT_SPECS[sym]).toBeDefined();
    }
  });

  it('all specs have required fields', () => {
    for (const sym of allSymbols) {
      const spec = CONTRACT_SPECS[sym];
      expect(spec.name).toBeTruthy();
      expect(spec.tickSize).toBeGreaterThan(0);
      expect(spec.tickValue).toBeGreaterThan(0);
      expect(spec.pointValue).toBeGreaterThan(0);
      expect(spec.contractIdPrefix).toBeTruthy();
      expect(spec.marginDay).toBeGreaterThan(0);
      expect(spec.marginOvernight).toBeGreaterThan(0);
      expect(['quarterly', 'monthly']).toContain(spec.expiryCycle);
    }
  });

  it('pointValue equals tickValue / tickSize', () => {
    for (const sym of allSymbols) {
      const spec = CONTRACT_SPECS[sym];
      const expected = spec.tickValue / spec.tickSize;
      expect(spec.pointValue).toBeCloseTo(expected, 6);
    }
  });

  it('new micro specs have correct values', () => {
    expect(CONTRACT_SPECS.MYM).toMatchObject({
      name: 'Micro E-mini Dow',
      tickSize: 1.0,
      tickValue: 0.5,
      contractIdPrefix: 'CON.F.US.MYM',
      expiryCycle: 'quarterly',
    });

    expect(CONTRACT_SPECS.MGC).toMatchObject({
      name: 'Micro Gold',
      tickSize: 0.1,
      tickValue: 1.0,
      contractIdPrefix: 'CON.F.US.MGC',
      expiryCycle: 'monthly',
    });

    expect(CONTRACT_SPECS.MCL).toMatchObject({
      name: 'Micro Crude Oil',
      tickSize: 0.01,
      tickValue: 1.0,
      contractIdPrefix: 'CON.F.US.MCL',
      expiryCycle: 'monthly',
    });

    expect(CONTRACT_SPECS.MBT).toMatchObject({
      name: 'Micro Bitcoin',
      tickSize: 5.0,
      tickValue: 0.5,
      contractIdPrefix: 'CON.F.CME.MBT',
      expiryCycle: 'monthly',
    });
  });

  it('quarterly symbols have correct expiryCycle', () => {
    for (const sym of ['ES', 'NQ', 'MES', 'MNQ', 'MYM']) {
      expect(CONTRACT_SPECS[sym].expiryCycle).toBe('quarterly');
    }
  });

  it('monthly symbols have correct expiryCycle', () => {
    for (const sym of ['MGC', 'MCL', 'MBT']) {
      expect(CONTRACT_SPECS[sym].expiryCycle).toBe('monthly');
    }
  });
});

describe('getCurrentContractId', () => {
  let realDate: typeof Date;

  beforeEach(() => {
    realDate = globalThis.Date;
  });

  afterEach(() => {
    globalThis.Date = realDate;
  });

  function mockDate(year: number, month: number, day: number) {
    const fixed = new realDate(year, month - 1, day, 12, 0, 0);
    globalThis.Date = class extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixed.getTime());
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(...(args as [any]));
        }
      }
      static now() {
        return fixed.getTime();
      }
    } as typeof Date;
  }

  describe('quarterly symbols', () => {
    it('returns correct contract ID with prefix', () => {
      mockDate(2026, 1, 15); // Jan 15 → next quarterly = Mar
      const id = getCurrentContractId('MES');
      expect(id).toBe('CON.F.US.MES.H26');
    });

    it('MYM uses quarterly expiry', () => {
      mockDate(2026, 1, 15); // Jan 15 → next quarterly = Mar
      const id = getCurrentContractId('MYM');
      expect(id).toBe('CON.F.US.MYM.H26');
    });

    it('rolls to next quarter after day 19', () => {
      mockDate(2026, 3, 20); // Mar 20 → rolled past Mar, next = Jun
      const id = getCurrentContractId('MES');
      expect(id).toBe('CON.F.US.MES.M26');
    });

    it('stays in current quarter on day 19', () => {
      mockDate(2026, 3, 19); // Mar 19 → still in Mar
      const id = getCurrentContractId('MES');
      expect(id).toBe('CON.F.US.MES.H26');
    });

    it('rolls to next year from Dec after rollover', () => {
      mockDate(2026, 12, 20); // Dec 20 → rolled past Dec, next = Mar 2027
      const id = getCurrentContractId('MES');
      expect(id).toBe('CON.F.US.MES.H27');
    });
  });

  describe('monthly symbols', () => {
    it('MGC uses monthly expiry - returns current month before rollover', () => {
      mockDate(2026, 2, 10); // Feb 10 → current month Feb
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.G26'); // G = Feb
    });

    it('MCL rolls to next month after day 19', () => {
      mockDate(2026, 2, 20); // Feb 20 → rolled, next = Mar
      const id = getCurrentContractId('MCL');
      expect(id).toBe('CON.F.US.MCL.H26'); // H = Mar
    });

    it('MBT uses correct prefix (CME)', () => {
      mockDate(2026, 5, 10); // May 10 → current month May
      const id = getCurrentContractId('MBT');
      expect(id).toBe('CON.F.CME.MBT.K26'); // K = May
    });

    it('monthly rolls to Jan of next year from Dec after rollover', () => {
      mockDate(2026, 12, 20); // Dec 20 → rolled, next = Jan 2027
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.F27'); // F = Jan
    });

    it('monthly stays in Dec before rollover', () => {
      mockDate(2026, 12, 15); // Dec 15 → still Dec
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.Z26'); // Z = Dec
    });
  });

  describe('edge cases', () => {
    it('defaults to ES specs for unknown symbol', () => {
      mockDate(2026, 1, 15);
      const id = getCurrentContractId('UNKNOWN');
      expect(id).toMatch(/^CON\.F\.US\.EP\./);
    });

    it('defaults to ES when no symbol provided', () => {
      mockDate(2026, 1, 15);
      const id = getCurrentContractId();
      expect(id).toMatch(/^CON\.F\.US\.EP\./);
    });

    it('handles case-insensitive symbols', () => {
      mockDate(2026, 1, 15);
      const id = getCurrentContractId('mes');
      expect(id).toBe('CON.F.US.MES.H26');
    });
  });
});
