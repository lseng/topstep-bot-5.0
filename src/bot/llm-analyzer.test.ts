import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeTrade, type LLMContext } from './llm-analyzer';
import { EventEmitter } from 'events';

const mockContext: LLMContext = {
  symbol: 'NQ',
  action: 'buy',
  vpvr: { poc: 18500, vah: 18550, val: 18450, rangeHigh: 18600, rangeLow: 18400, profileBins: [], totalVolume: 50000 },
  confirmationScore: 85,
  targetEntry: 18450,
  tp1: 18500,
  tp2: 18550,
  tp3: 18600,
  initialSl: 18425,
};

// Mock child_process.spawn
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'child_process';

function createMockProcess(output: string, exitCode = 0, delay = 0): EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> };
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn();

  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(output));
    setTimeout(() => proc.emit('close', exitCode), delay);
  }, delay || 10);

  return proc;
}

describe('analyzeTrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should return analysis on successful response', async () => {
    const mockProc = createMockProcess(
      '{"reasoning": "Strong VPVR confluence at VAL", "confidence": 0.85}'
    );
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = analyzeTrade(mockContext);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toEqual({
      reasoning: 'Strong VPVR confluence at VAL',
      confidence: 0.85,
    });
  });

  it('should return null on process error', async () => {
    const mockProc = createMockProcess('', 1);
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = analyzeTrade(mockContext);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toBeNull();
  });

  it('should return null on invalid JSON response', async () => {
    const mockProc = createMockProcess('This is not JSON at all');
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = analyzeTrade(mockContext);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toBeNull();
  });

  it('should return null on spawn error', async () => {
    const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> };
    proc.stdout = new EventEmitter();
    proc.kill = vi.fn();

    vi.mocked(spawn).mockReturnValue(proc as never);

    const promise = analyzeTrade(mockContext);

    // Emit error
    setTimeout(() => proc.emit('error', new Error('spawn ENOENT')), 10);
    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBeNull();
  });

  it('should clamp confidence to 0-1 range', async () => {
    const mockProc = createMockProcess(
      '{"reasoning": "test", "confidence": 1.5}'
    );
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = analyzeTrade(mockContext);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result?.confidence).toBe(1);
  });

  it('should extract JSON from surrounding text', async () => {
    const mockProc = createMockProcess(
      'Here is my analysis:\n{"reasoning": "Good setup", "confidence": 0.75}\nEnd.'
    );
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = analyzeTrade(mockContext);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result?.reasoning).toBe('Good setup');
  });
});
