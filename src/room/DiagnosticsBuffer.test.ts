import { describe, expect, it } from 'vitest';
import { LogLevel } from '../logger';
import {
  DEFAULT_DIAGNOSTICS_BUFFER_SIZE,
  DiagnosticsBuffer,
  type LogDiagnosticEntry,
} from './DiagnosticsBuffer';

const logEntry = (message: string): LogDiagnosticEntry => ({
  type: 'log',
  timestamp: 0,
  level: LogLevel.info,
  message,
});

describe('DiagnosticsBuffer', () => {
  it('uses the default capacity when no size is provided', () => {
    const buffer = new DiagnosticsBuffer();
    expect(buffer.size).toBe(DEFAULT_DIAGNOSTICS_BUFFER_SIZE);
  });

  it('honours a custom capacity', () => {
    const buffer = new DiagnosticsBuffer({ size: 4 });
    expect(buffer.size).toBe(4);
  });

  it('falls back to default when size is invalid', () => {
    expect(new DiagnosticsBuffer({ size: 0 }).size).toBe(DEFAULT_DIAGNOSTICS_BUFFER_SIZE);
    expect(new DiagnosticsBuffer({ size: -5 }).size).toBe(DEFAULT_DIAGNOSTICS_BUFFER_SIZE);
  });

  it('returns entries in chronological order while under capacity', () => {
    const buffer = new DiagnosticsBuffer({ size: 4 });
    buffer.push(logEntry('a'));
    buffer.push(logEntry('b'));
    buffer.push(logEntry('c'));
    expect(buffer.snapshot().map((e) => (e as LogDiagnosticEntry).message)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(buffer.count).toBe(3);
  });

  it('overwrites the oldest entry once capacity is reached', () => {
    const buffer = new DiagnosticsBuffer({ size: 3 });
    ['a', 'b', 'c', 'd', 'e'].forEach((m) => buffer.push(logEntry(m)));
    expect(buffer.snapshot().map((e) => (e as LogDiagnosticEntry).message)).toEqual([
      'c',
      'd',
      'e',
    ]);
    expect(buffer.count).toBe(3);
  });

  it('snapshot returns a detached copy', () => {
    const buffer = new DiagnosticsBuffer({ size: 3 });
    buffer.push(logEntry('a'));
    const snap = buffer.snapshot();
    buffer.push(logEntry('b'));
    expect(snap.map((e) => (e as LogDiagnosticEntry).message)).toEqual(['a']);
  });

  it('clear empties the buffer', () => {
    const buffer = new DiagnosticsBuffer({ size: 3 });
    buffer.push(logEntry('a'));
    buffer.push(logEntry('b'));
    buffer.clear();
    expect(buffer.count).toBe(0);
    expect(buffer.snapshot()).toEqual([]);
    // subsequent pushes work from a clean state
    buffer.push(logEntry('c'));
    expect(buffer.snapshot().map((e) => (e as LogDiagnosticEntry).message)).toEqual(['c']);
  });

  it('accepts custom entry types beyond log entries', () => {
    interface StatsEntry {
      type: 'stats';
      timestamp: number;
      bytesSent: number;
    }
    const buffer = new DiagnosticsBuffer({ size: 2 });
    // buffer is intentionally agnostic to kind — future entry variants can be
    // pushed once the DiagnosticEntry union is extended.
    buffer.push({ type: 'stats', timestamp: 1, bytesSent: 42 } as unknown as LogDiagnosticEntry);
    expect((buffer.snapshot()[0] as unknown as StatsEntry).bytesSent).toBe(42);
  });
});
