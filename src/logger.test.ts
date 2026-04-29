import * as loglevel from 'loglevel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type LogExtension,
  LogLevel,
  LoggerNames,
  type StructuredLogger,
  formatDisplayContext,
  getLogger,
  setLogExtension,
  setLogLevel,
} from './logger';

describe('formatDisplayContext', () => {
  it('returns an empty string for undefined or empty input', () => {
    expect(formatDisplayContext(undefined)).toBe('');
    expect(formatDisplayContext({})).toBe('');
  });

  it('renders only recognised display keys, skipping undefined/null/empty', () => {
    const out = formatDisplayContext({
      room: 'foo',
      roomID: undefined,
      participant: 'alice',
      participantID: '',
      trackID: null,
      source: 'camera',
      irrelevant: 'should-not-show',
    });
    expect(out).toBe('[room=foo participant=alice source=camera]');
  });

  it('preserves the canonical key ordering regardless of input order', () => {
    const a = formatDisplayContext({ trackID: 'T', room: 'R', participant: 'P' });
    const b = formatDisplayContext({ participant: 'P', trackID: 'T', room: 'R' });
    expect(a).toBe(b);
    expect(a).toBe('[room=R participant=P trackID=T]');
  });

  it('handles non-string values by stringifying them', () => {
    expect(formatDisplayContext({ reconnectAttempt: 3 })).toBe('[reconnectAttempt=3]');
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

  it('prepends a context prefix to the message and merges context for extensions', () => {
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
    expect(msg).toBe('[room=foo participant=alice] hello world');
    expect(ctx).toEqual({ room: 'foo', participant: 'alice', extra: 1 });
  });

  it('omits the prefix when the bound context has no display keys', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Room, extension);
    setLogLevel(LogLevel.info, LoggerNames.Room);

    const log = getLogger(LoggerNames.Room, () => ({ irrelevant: 'x' }));
    log.info('plain');

    expect(extension).toHaveBeenCalledWith(LogLevel.info, 'plain', { irrelevant: 'x' });
  });

  it('reflects dynamic changes to the bound context on every call', () => {
    const extension = vi.fn<LogExtension>();
    hookBase(LoggerNames.Engine, extension);
    setLogLevel(LogLevel.info, LoggerNames.Engine);

    let current: Record<string, string> = { room: 'r1' };
    const log = getLogger(LoggerNames.Engine, () => current);

    log.info('first');
    current = { room: 'r2', participant: 'bob' };
    log.info('second');

    const infos = extension.mock.calls.filter((c) => c[0] === LogLevel.info);
    expect(infos[0][1]).toBe('[room=r1] first');
    expect(infos[1][1]).toBe('[room=r2 participant=bob] second');
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
