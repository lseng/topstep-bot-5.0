// Structured JSON logger for Vercel

import type { LogLevel, LogEntry } from '../types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Sensitive keys that should never be logged
const SENSITIVE_KEYS = ['secret', 'password', 'token', 'apiKey', 'api_key', 'authorization'];

function redactSensitive(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function createLogEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data: redactSensitive(data) }),
  };
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, data);
  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(output);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>): void => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>): void => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>): void => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>): void => log('error', message, data),
};

export { redactSensitive, createLogEntry, shouldLog };
