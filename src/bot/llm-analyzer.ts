// LLM trade analyzer — fire-and-forget Claude Code CLI invocation

import { exec } from 'child_process';
import { logger } from '../lib/logger';

/** Context passed to the LLM for analysis */
export interface AnalysisContext {
  symbol: string;
  action: string;
  vpvrLevels: {
    poc: number;
    vah: number;
    val: number;
    rangeHigh: number;
    rangeLow: number;
  };
  confirmationScore: number;
  price: number;
}

/** LLM analysis result */
export interface AnalysisResult {
  reasoning: string;
  confidence: number;
}

const LLM_TIMEOUT_MS = 10_000;

/**
 * Invoke Claude Code CLI to analyze a trade setup.
 *
 * Fire-and-forget — never blocks trade execution.
 * Returns null on timeout or error.
 *
 * @param context - Trade context for analysis
 * @returns Analysis result or null
 */
export async function analyzeTrade(context: AnalysisContext): Promise<AnalysisResult | null> {
  const prompt = formatPrompt(context);

  try {
    const output = await execWithTimeout(
      `echo ${JSON.stringify(prompt)} | claude --print --dangerously-skip-permissions 2>/dev/null`,
      LLM_TIMEOUT_MS,
    );

    return parseResponse(output);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown';
    logger.warn('LLM analysis failed', { error: msg, symbol: context.symbol });
    return null;
  }
}

function formatPrompt(ctx: AnalysisContext): string {
  return [
    `Analyze this ${ctx.action.toUpperCase()} trade setup for ${ctx.symbol}:`,
    `Current price: ${ctx.price}`,
    `VPVR levels: POC=${ctx.vpvrLevels.poc}, VAH=${ctx.vpvrLevels.vah}, VAL=${ctx.vpvrLevels.val}`,
    `Range: ${ctx.vpvrLevels.rangeLow} - ${ctx.vpvrLevels.rangeHigh}`,
    `Confirmation score: ${ctx.confirmationScore}/100`,
    '',
    'Respond in JSON: {"reasoning": "brief analysis", "confidence": 0.0-1.0}',
  ].join('\n');
}

function parseResponse(output: string): AnalysisResult | null {
  try {
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[^}]*"reasoning"[^}]*"confidence"[^}]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { reasoning?: string; confidence?: number };
    if (typeof parsed.reasoning !== 'string' || typeof parsed.confidence !== 'number') {
      return null;
    }

    return {
      reasoning: parsed.reasoning,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

function execWithTimeout(command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });

    // Safety timeout
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('LLM analysis timed out'));
    }, timeoutMs + 1000);

    proc.on('exit', () => clearTimeout(timer));
  });
}
