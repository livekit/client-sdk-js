import * as loglevel from 'loglevel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LogLevel,
  LoggerNames,
  type LogExtension,
  type StructuredLogger,
  formatDisplayContext,
  getLogger,
  setLogExtension,
  setLogLevel,
} from './logger';

describe('formatDisplayContext', () => {
  // `DISPLAY_KEYS` is intentionally empty by default — the formatter is a
  // no-op until keys are opted into the bracketed prefix.
  it('returns an empty string for every input until display keys are configured', () => {
    expect(formatDisplayContext(undefined)).toBe('');
    expect(formatDisplayContext({})).toBe('');
    expect(formatDisplayContext({ room: 'foo', participant: 'alice' })).toBe('');
  });
});

describe('getLogger with context provider', () => {
  afterEach(() => {
    setLogLevel(LogLevel.info);
  });

  const hookBase = (name: LoggerNames, extension: LogExtension) => {
    const base = loglevel.getLogger(name) as StructuredLogger;
    setLogExtension(extension, base);
  };

  it('merges bound context with per-call extras for extensions', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Default, extension);
    setLogLevel(LogLevel.debug, LoggerNames.Default);

    const log = getLogger(LoggerNames.Default, () => ({
      room: 'foo',
      participant: 'alice',
    }));
    log.debug('hello world', { extra: 1 });

    const debugCalls = extension.mock.calls.filter((c) => c[0] === LogLevel.debug);
    expect(debugCalls).toHaveLength(1);
    const [level, msg, ctx] = debugCalls[0];
    expect(level).toBe(LogLevel.debug);
    expect(msg).toBe('hello world');
    expect(ctx).toEqual({ room: 'foo', participant: 'alice', extra: 1 });
  });

  it('passes bound context through when no extras are supplied', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Room, extension);
    setLogLevel(LogLevel.info, LoggerNames.Room);

    const log = getLogger(LoggerNames.Room, () => ({ irrelevant: 'x' }));
    log.info('plain');

    expect(extension).toHaveBeenCalledWith(LogLevel.info, 'plain', { irrelevant: 'x' });
  });

  it('re-reads the bound context on every call', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Engine, extension);
    setLogLevel(LogLevel.info, LoggerNames.Engine);

    let current: Record<string, string> = { room: 'r1' };
    const log = getLogger(LoggerNames.Engine, () => current);

    log.info('first');
    current = { room: 'r2', participant: 'bob' };
    log.info('second');

    const infos = extension.mock.calls.filter((c) => c[0] === LogLevel.info);
    expect(infos[0][2]).toEqual({ room: 'r1' });
    expect(infos[1][2]).toEqual({ room: 'r2', participant: 'bob' });
  });

  it('returns an unwrapped logger when no context provider is supplied', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Signal, extension);
    setLogLevel(LogLevel.info, LoggerNames.Signal);

    const log = getLogger(LoggerNames.Signal);
    log.info('raw');

    expect(extension).toHaveBeenCalledWith(LogLevel.info, 'raw', undefined);
  });
});
