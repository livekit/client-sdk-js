import { describe, expect, it } from 'vitest';
import { LogLevel, LoggerNames, setLogLevel } from '../logger';
import type { LogDiagnosticEntry } from './DiagnosticsBuffer';
import Room from './Room';
import { RoomEvent } from './events';

describe('Active device switch', () => {
  it('updates devices correctly', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test');
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('updates devices with exact constraint', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test', true);
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('emits changed event', async () => {
    const room = new Room();
    let kind: MediaDeviceKind | undefined;
    let deviceId: string | undefined;
    const deviceChangeHandler = (_kind: MediaDeviceKind, _deviceId: string) => {
      kind = _kind;
      deviceId = _deviceId;
    };
    room.on(RoomEvent.ActiveDeviceChanged, deviceChangeHandler);
    await room.switchActiveDevice('audioinput', 'test', true);

    expect(deviceId).toBe('test');
    expect(kind).toBe('audioinput');
  });
});

describe('Room diagnostics', () => {
  it('captures internal log entries into the ring buffer', async () => {
    setLogLevel(LogLevel.debug, LoggerNames.Room);
    const room = new Room({ diagnostics: { size: 16 } });
    // trigger an internal log at a known level
    (room as unknown as { log: { info: (m: string) => void } }).log.info(
      'diagnostics roundtrip probe',
    );
    const entries = await room.getRecentDiagnostics();
    const probe = entries.find(
      (e): e is LogDiagnosticEntry =>
        e.type === 'log' && (e as LogDiagnosticEntry).message.includes('diagnostics roundtrip probe'),
    );
    expect(probe).toBeDefined();
    expect(probe?.level).toBe(LogLevel.info);
    setLogLevel(LogLevel.info);
  });

  it('returns an empty array when diagnostics are disabled', async () => {
    const room = new Room({ diagnostics: false });
    expect(await room.getRecentDiagnostics()).toEqual([]);
  });

  it('accepts custom entries via recordDiagnostic', async () => {
    const room = new Room({ diagnostics: { size: 4 } });
    room.recordDiagnostic({
      type: 'log',
      timestamp: 1234,
      level: LogLevel.warn,
      message: 'manual entry',
    });
    const entries = await room.getRecentDiagnostics();
    expect(entries.some((e) => (e as LogDiagnosticEntry).message === 'manual entry')).toBe(true);
  });
});
