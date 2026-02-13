import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeTrade, type AnalysisContext } from './llm-analyzer';

// Mock child_process.exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';

const mockExec = vi.mocked(exec);

function makeContext(): AnalysisContext {
  return {
    symbol: 'ES',
    action: 'buy',
    vpvrLevels: {
      poc: 5050,
      vah: 5080,
      val: 5020,
      rangeHigh: 5100,
      rangeLow: 5000,
    },
    confirmationScore: 85,
    price: 5025,
  };
}

describe('analyzeTrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns reasoning and confidence on success', async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      cb(null, '{"reasoning": "Strong buy at VAL with high confirmation", "confidence": 0.85}');
      return { kill: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof exec>;
    });

    const result = await analyzeTrade(makeContext());

    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe('Strong buy at VAL with high confirmation');
    expect(result!.confidence).toBe(0.85);
  });

  it('returns null on timeout', async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      const error = new Error('Command timed out');
      cb(error, '');
      return { kill: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof exec>;
    });

    const result = await analyzeTrade(makeContext());
    expect(result).toBeNull();
  });

  it('returns null on CLI error', async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      cb(new Error('Claude CLI not found'), '');
      return { kill: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof exec>;
    });

    const result = await analyzeTrade(makeContext());
    expect(result).toBeNull();
  });

  it('returns null for non-JSON response', async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      cb(null, 'Sorry, I cannot help with that.');
      return { kill: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof exec>;
    });

    const result = await analyzeTrade(makeContext());
    expect(result).toBeNull();
  });

  it('clamps confidence to 0-1 range', async () => {
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      cb(null, '{"reasoning": "test", "confidence": 1.5}');
      return { kill: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof exec>;
    });

    const result = await analyzeTrade(makeContext());
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1);
  });
});
