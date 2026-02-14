// E2E test: Verify all 51 CONTRACT_SPECS symbols have valid contractIdPrefix format
// and getCurrentContractId() produces valid contract IDs for all symbols

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONTRACT_SPECS, EXPIRY_CODES } from '../../src/services/topstepx/types';
import { getCurrentContractId } from '../../src/services/topstepx/client';

vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('CONTRACT_SPECS: all 51 symbols have valid prefixes', () => {
  const allSymbols = Object.keys(CONTRACT_SPECS);

  it('contains exactly 51 symbols', () => {
    expect(allSymbols.length).toBe(51);
  });

  for (const sym of allSymbols) {
    it(`${sym} has prefix matching CON.F.US.* pattern`, () => {
      const prefix = CONTRACT_SPECS[sym].contractIdPrefix;
      expect(prefix).toMatch(/^CON\.F\.US\.[A-Z0-9]+$/);
    });
  }
});

describe('getCurrentContractId: valid IDs for all 51 symbols', () => {
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

  // Test all symbols produce valid contract IDs
  const allSymbols = Object.keys(CONTRACT_SPECS);
  // Valid month codes from EXPIRY_CODES
  const validMonthCodes = Object.values(EXPIRY_CODES);

  for (const sym of allSymbols) {
    it(`${sym} produces valid contract ID format`, () => {
      mockDate(2026, 2, 10); // Feb 10, 2026 — mid-month, before rollover
      const id = getCurrentContractId(sym);
      const spec = CONTRACT_SPECS[sym];

      // Must start with the symbol's prefix
      expect(id.startsWith(spec.contractIdPrefix)).toBe(true);

      // Must match format: PREFIX.{month_code}{2-digit-year}
      const suffix = id.slice(spec.contractIdPrefix.length + 1); // +1 for the dot
      expect(suffix.length).toBe(3); // e.g. "G26"
      const monthCode = suffix[0];
      const yearCode = suffix.slice(1);
      expect(validMonthCodes).toContain(monthCode);
      expect(yearCode).toMatch(/^\d{2}$/);
    });
  }

  it('all quarterly symbols resolve to H/M/U/Z months', () => {
    const quarterlySymbols = allSymbols.filter(
      (s) => CONTRACT_SPECS[s].expiryCycle === 'quarterly',
    );
    expect(quarterlySymbols.length).toBeGreaterThan(0);

    for (const sym of quarterlySymbols) {
      mockDate(2026, 2, 10);
      const id = getCurrentContractId(sym);
      const monthCode = id[id.length - 3];
      expect(['H', 'M', 'U', 'Z']).toContain(monthCode);
    }
  });

  it('all quarterly_fjnv symbols resolve to F/J/N/V months', () => {
    const fjnvSymbols = allSymbols.filter(
      (s) => CONTRACT_SPECS[s].expiryCycle === 'quarterly_fjnv',
    );
    expect(fjnvSymbols.length).toBeGreaterThan(0);

    for (const sym of fjnvSymbols) {
      mockDate(2026, 2, 10);
      const id = getCurrentContractId(sym);
      const monthCode = id[id.length - 3];
      expect(['F', 'J', 'N', 'V']).toContain(monthCode);
    }
  });
});
