import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, redactSensitive, createLogEntry, shouldLog } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  describe('redactSensitive', () => {
    it('redacts sensitive keys', () => {
      const data = {
        username: 'test',
        secret: 'mysecret',
        apiKey: 'key123',
        password: 'pass123',
      };
      const result = redactSensitive(data);
      expect(result.username).toBe('test');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
    });

    it('redacts nested sensitive keys', () => {
      const data = {
        user: {
          name: 'test',
          token: 'abc123',
        },
      };
      const result = redactSensitive(data);
      expect((result.user as Record<string, unknown>).name).toBe('test');
      expect((result.user as Record<string, unknown>).token).toBe('[REDACTED]');
    });
  });

  describe('createLogEntry', () => {
    it('creates a log entry with timestamp', () => {
      const entry = createLogEntry('info', 'test message');
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('test message');
      expect(entry.timestamp).toBeDefined();
    });

    it('includes redacted data', () => {
      const entry = createLogEntry('info', 'test', { key: 'value', secret: 'hidden' });
      expect(entry.data?.key).toBe('value');
      expect(entry.data?.secret).toBe('[REDACTED]');
    });
  });

  describe('shouldLog', () => {
    it('respects LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'warn';
      expect(shouldLog('debug')).toBe(false);
      expect(shouldLog('info')).toBe(false);
      expect(shouldLog('warn')).toBe(true);
      expect(shouldLog('error')).toBe(true);
    });

    it('defaults to info level', () => {
      expect(shouldLog('debug')).toBe(false);
      expect(shouldLog('info')).toBe(true);
    });
  });

  describe('logger methods', () => {
    it('logs info messages', () => {
      logger.info('test info');
      expect(console.log).toHaveBeenCalled();
    });

    it('logs warn messages', () => {
      logger.warn('test warn');
      expect(console.warn).toHaveBeenCalled();
    });

    it('logs error messages', () => {
      logger.error('test error');
      expect(console.error).toHaveBeenCalled();
    });

    it('does not log debug when level is info', () => {
      logger.debug('test debug');
      expect(console.log).not.toHaveBeenCalled();
    });
  });
});
