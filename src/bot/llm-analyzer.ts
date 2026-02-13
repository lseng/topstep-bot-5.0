// LLM Trade Analyzer — Fire-and-forget Claude analysis
// Invokes Claude CLI programmatically with VPVR and alert context

import { spawn } from 'child_process';
import type { VPVRResult } from '../services/vpvr/types';

const LLM_TIMEOUT_MS = 10000;

export interface LLMAnalysis {
  reasoning: string;
  confidence: number;
}

export interface LLMContext {
  symbol: string;
  action: string;
  vpvr: VPVRResult;
  confirmationScore: number | null;
  targetEntry: number;
  tp1: number;
  tp2: number;
  tp3: number;
  initialSl: number;
}

/**
 * Analyze a trade setup using an LLM. Fire-and-forget with timeout.
 * Never blocks trade execution — returns null on any failure.
 */
export async function analyzeTrade(context: LLMContext): Promise<LLMAnalysis | null> {
  const prompt = buildPrompt(context);

  try {
    const result = await runWithTimeout(prompt, LLM_TIMEOUT_MS);
    return parseResult(result);
  } catch {
    return null;
  }
}

function buildPrompt(ctx: LLMContext): string {
  return `Analyze this trade setup briefly (2-3 sentences max):

Symbol: ${ctx.symbol}, Action: ${ctx.action}
VPVR: POC=${ctx.vpvr.poc}, VAH=${ctx.vpvr.vah}, VAL=${ctx.vpvr.val}
Range: ${ctx.vpvr.rangeLow} - ${ctx.vpvr.rangeHigh}
Confirmation Score: ${ctx.confirmationScore ?? 'N/A'}/100
Entry: ${ctx.targetEntry}, SL: ${ctx.initialSl}
TP1: ${ctx.tp1}, TP2: ${ctx.tp2}, TP3: ${ctx.tp3}

Respond in JSON: {"reasoning": "...", "confidence": 0.0-1.0}`;
}

function runWithTimeout(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', prompt], {
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let output = '';
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`LLM process exited with code ${code}`));
      }
    });

    proc.on('error', reject);

    setTimeout(() => {
      proc.kill();
      reject(new Error('LLM analysis timed out'));
    }, timeoutMs);
  });
}

function parseResult(raw: string): LLMAnalysis | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*"reasoning"[\s\S]*"confidence"[\s\S]*\}/);
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
