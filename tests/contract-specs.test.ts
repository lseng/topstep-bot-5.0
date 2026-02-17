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
  const allSymbols = [
    // CME Equity Index Futures
    'ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'NKD',
    // CME Crypto Futures
    'MBT', 'MET',
    // CME FX Futures
    '6A', '6B', '6C', '6E', '6J', '6S', 'E7', 'M6E', 'M6A', 'M6B', '6M', '6N',
    // CME NYMEX Energy Futures
    'CL', 'QM', 'MCL', 'NG', 'QG', 'MNG', 'RB', 'HO',
    // CME COMEX Metals Futures
    'GC', 'MGC', 'SI', 'SIL', 'HG', 'MHG', 'PL',
    // CBOT Agricultural Futures
    'ZC', 'ZW', 'ZS', 'ZM', 'ZL', 'HE', 'LE',
    // CBOT Interest Rate Futures
    'ZT', 'ZF', 'ZN', 'TN', 'ZB', 'UB',
  ];

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
      expect(['quarterly', 'monthly', 'quarterly_fjnv']).toContain(spec.expiryCycle);
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
      contractIdPrefix: 'CON.F.US.MCLE',
      expiryCycle: 'monthly',
    });

    expect(CONTRACT_SPECS.MBT).toMatchObject({
      name: 'Micro Bitcoin',
      tickSize: 5.0,
      tickValue: 0.5,
      contractIdPrefix: 'CON.F.US.MBT',
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

  it('PL uses quarterly_fjnv expiry cycle', () => {
    expect(CONTRACT_SPECS['PL'].expiryCycle).toBe('quarterly_fjnv');
  });

  it('has exactly 51 symbols', () => {
    expect(Object.keys(CONTRACT_SPECS).length).toBe(51);
  });

  it('all 51 symbols have valid contractIdPrefix format', () => {
    for (const [sym, spec] of Object.entries(CONTRACT_SPECS)) {
      expect(spec.contractIdPrefix).toMatch(/^CON\.F\.US\..+$/);
      // Prefix must not end with a dot
      expect(spec.contractIdPrefix.endsWith('.')).toBe(false);
    }
  });

  it('corrected contract ID prefixes use API-verified values', () => {
    // Key prefix corrections from API verification pass
    const corrections: Record<string, string> = {
      '6A': 'CON.F.US.DA6',
      '6B': 'CON.F.US.BP6',
      '6C': 'CON.F.US.CA6',
      '6E': 'CON.F.US.EU6',
      '6J': 'CON.F.US.JY6',
      '6S': 'CON.F.US.SF6',
      '6M': 'CON.F.US.MX6',
      '6N': 'CON.F.US.NE6',
      GC: 'CON.F.US.GCE',
      CL: 'CON.F.US.CLE',
      NG: 'CON.F.US.NGE',
      SI: 'CON.F.US.SIE',
      HG: 'CON.F.US.CPE',
      PL: 'CON.F.US.PLE',
      ZN: 'CON.F.US.TYA',
      ZB: 'CON.F.US.USA',
      ZT: 'CON.F.US.TUA',
      ZF: 'CON.F.US.FVA',
      TN: 'CON.F.US.TNA',
      UB: 'CON.F.US.ULA',
      ZW: 'CON.F.US.ZWA',
      ZC: 'CON.F.US.ZCE',
      ZS: 'CON.F.US.ZSE',
      ZM: 'CON.F.US.ZME',
      ZL: 'CON.F.US.ZLE',
      LE: 'CON.F.US.GLE',
      RB: 'CON.F.US.RBE',
      HO: 'CON.F.US.HOE',
    };
    for (const [sym, expectedPrefix] of Object.entries(corrections)) {
      expect(CONTRACT_SPECS[sym].contractIdPrefix).toBe(expectedPrefix);
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
    // Monthly contracts use delivery-month naming: the contract actively
    // trading in month N is named for month N+1 delivery.
    it('MGC bimonthly delivery skips March → April', () => {
      mockDate(2026, 2, 10); // Feb 10 → trading Feb, next delivery = Apr
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.J26'); // J = Apr (Gold has no March delivery)
    });

    it('MCL rolls to next month after day 19 (with delivery offset)', () => {
      mockDate(2026, 2, 20); // Feb 20 → rolled to Mar contract → delivery = Apr
      const id = getCurrentContractId('MCL');
      expect(id).toBe('CON.F.US.MCLE.J26'); // J = Apr (delivery month)
    });

    it('GC bimonthly delivery matches MGC', () => {
      mockDate(2026, 2, 10); // Feb 10 → next delivery = Apr
      const id = getCurrentContractId('GC');
      expect(id).toBe('CON.F.US.GCE.J26'); // J = Apr
    });

    it('HE uses custom delivery months (skips Mar)', () => {
      mockDate(2026, 2, 10); // Feb 10 → next delivery in [2,4,5,6,7,8,10,12] > 2 = Apr
      const id = getCurrentContractId('HE');
      expect(id).toBe('CON.F.US.HE.J26'); // J = Apr
    });

    it('LE bimonthly delivery skips odd months', () => {
      mockDate(2026, 2, 10); // Feb 10 → next even delivery > 2 = Apr
      const id = getCurrentContractId('LE');
      expect(id).toBe('CON.F.US.GLE.J26'); // J = Apr
    });

    it('MBT crypto skips delivery-month offset', () => {
      mockDate(2026, 5, 10); // May 10 → trading May contract (crypto settles same month)
      const id = getCurrentContractId('MBT');
      expect(id).toBe('CON.F.US.MBT.K26'); // K = May (no delivery offset)
    });

    it('MET crypto skips delivery-month offset', () => {
      mockDate(2026, 2, 10); // Feb 10 → trading Feb contract
      const id = getCurrentContractId('MET');
      expect(id).toBe('CON.F.US.GMET.G26'); // G = Feb (no delivery offset)
    });

    it('MGC bimonthly wraps to Feb of next year from Dec after rollover', () => {
      mockDate(2026, 12, 20); // Dec 20 → rolled to Jan 2027 → next delivery = Feb 2027
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.G27'); // G = Feb (next even delivery month)
    });

    it('MGC bimonthly wraps to Feb in Dec before rollover', () => {
      mockDate(2026, 12, 15); // Dec 15 → trading Dec → next delivery > 12 wraps to Feb 2027
      const id = getCurrentContractId('MGC');
      expect(id).toBe('CON.F.US.MGC.G27'); // G = Feb (no Jan delivery for Gold)
    });
  });

  describe('quarterly_fjnv symbols (PL)', () => {
    it('resolves to Jan(F) in early January', () => {
      mockDate(2026, 1, 10); // Jan 10 → in Jan expiry, before rollover
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.F26'); // F = Jan
    });

    it('rolls to Apr(J) after Jan 19', () => {
      mockDate(2026, 1, 20); // Jan 20 → rolled past Jan, next = Apr
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.J26'); // J = Apr
    });

    it('resolves to Apr(J) in early April', () => {
      mockDate(2026, 4, 10); // Apr 10 → in Apr expiry
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.J26'); // J = Apr
    });

    it('rolls to Jul(N) after Apr 19', () => {
      mockDate(2026, 4, 20); // Apr 20 → rolled, next = Jul
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.N26'); // N = Jul
    });

    it('resolves to Oct(V) in early October', () => {
      mockDate(2026, 10, 10); // Oct 10 → in Oct expiry
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.V26'); // V = Oct
    });

    it('rolls to Jan(F) next year after Oct 19', () => {
      mockDate(2026, 10, 20); // Oct 20 → rolled, next = Jan 2027
      const id = getCurrentContractId('PL');
      expect(id).toBe('CON.F.US.PLE.F27'); // F = Jan 2027
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
