import * as loglevel from 'loglevel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type LogExtension,
  LogLevel,
  LoggerNames,
  type StructuredLogger,
  getLogger,
  setLogExtension,
  setLogLevel,
} from './logger';

describe('getLogger with context provider', () => {
  afterEach(() => {
    setLogLevel(LogLevel.info);
  });

  const hookBase = (name: LoggerNames, extension: LogExtension) => {
    const base = loglevel.getLogger(name) as StructuredLogger;
    setLogExtension(extension, base);
  };

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
