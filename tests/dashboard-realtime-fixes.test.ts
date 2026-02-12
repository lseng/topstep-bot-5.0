// Unit tests for dashboard realtime refresh fixes (Issue #8)
// Tests verify the source code patterns since we're in Node environment without jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf-8');
}

describe('Root Cause 1: Realtime invalidation → refetch', () => {
  const src = readSrc('dashboard/src/hooks/useRealtimeAlerts.ts');

  it('uses refetchQueries instead of invalidateQueries', () => {
    expect(src).not.toContain('invalidateQueries');
    expect(src).toContain('refetchQueries');
  });

  it('calls refetchQueries with alerts queryKey on INSERT', () => {
    expect(src).toContain("refetchQueries({ queryKey: ['alerts'] })");
  });

  it('calls refetchQueries with alert detail queryKey on UPDATE', () => {
    expect(src).toContain("refetchQueries({\n              queryKey: ['alert',");
  });
});

describe('Root Cause 2: Relative timestamps freeze', () => {
  describe('useTick hook', () => {
    const src = readSrc('dashboard/src/hooks/useTick.ts');

    it('exports useTick function', () => {
      expect(src).toContain('export function useTick');
    });

    it('uses useState for tick counter', () => {
      expect(src).toContain('useState');
    });

    it('uses setInterval for periodic updates', () => {
      expect(src).toContain('setInterval');
    });

    it('cleans up interval on unmount', () => {
      expect(src).toContain('clearInterval');
    });

    it('defaults to 1000ms interval', () => {
      expect(src).toContain('intervalMs = 1000');
    });
  });

  describe('AlertsTable uses useTick', () => {
    const src = readSrc('dashboard/src/components/AlertsTable.tsx');

    it('imports useTick hook', () => {
      expect(src).toContain("import { useTick } from '@dashboard/hooks/useTick'");
    });

    it('calls useTick() in component body', () => {
      expect(src).toContain('useTick()');
    });
  });

  describe('KpiCards uses useTick', () => {
    const src = readSrc('dashboard/src/components/KpiCards.tsx');

    it('imports useTick hook', () => {
      expect(src).toContain("import { useTick } from '@dashboard/hooks/useTick'");
    });

    it('calls useTick() in component body', () => {
      expect(src).toContain('useTick()');
    });
  });
});

describe('Root Cause 3: No polling fallback', () => {
  describe('useAlerts has refetchInterval', () => {
    const src = readSrc('dashboard/src/hooks/useAlerts.ts');

    it('includes refetchInterval: 5000 in useQuery options', () => {
      expect(src).toContain('refetchInterval: 5000');
    });
  });

  describe('useAlertDetail has refetchInterval', () => {
    const src = readSrc('dashboard/src/hooks/useAlertDetail.ts');

    it('includes refetchInterval: 5000 in useQuery options', () => {
      expect(src).toContain('refetchInterval: 5000');
    });

    it('still has enabled: !!id guard', () => {
      expect(src).toContain('enabled: !!id');
    });
  });
});

describe('Root Cause 4: KPI success rate calculation', () => {
  const src = readSrc('dashboard/src/App.tsx');

  it('uses pagination.total as denominator (not alerts.length)', () => {
    // Should contain: (executed / total) * 100
    expect(src).toContain('(executed / total) * 100');
  });

  it('does NOT divide by alerts.length for success rate', () => {
    // Should NOT contain the old buggy pattern
    expect(src).not.toContain('(executed / alerts.length) * 100');
  });

  it('guards against division by zero', () => {
    expect(src).toContain('total > 0');
  });
});
