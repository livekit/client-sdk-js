import { ClientInfo_Capability, JoinResponse } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import Room from './Room';
import { roomConnectOptionDefaults, roomOptionDefaults } from './defaults';
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

describe('Room signaling options', () => {
  it('advertises packet trailer capability when E2EE can handle trailers', async () => {
    const room = new Room();
    const join = vi.fn().mockResolvedValue({
      joinResponse: new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
      }),
      serverInfo: { version: '1.0.0' },
    });
    const engine = { join };

    (
      room as unknown as {
        e2eeManager: unknown;
        connectSignal: (
          url: string,
          token: string,
          engine: unknown,
          connectOptions: typeof roomConnectOptionDefaults,
          roomOptions: typeof roomOptionDefaults,
          abortController: AbortController,
        ) => Promise<JoinResponse>;
      }
    ).e2eeManager = {};

    await (
      room as unknown as {
        connectSignal: (
          url: string,
          token: string,
          engine: unknown,
          connectOptions: typeof roomConnectOptionDefaults,
          roomOptions: typeof roomOptionDefaults,
          abortController: AbortController,
        ) => Promise<JoinResponse>;
      }
    ).connectSignal(
      'wss://test.livekit.io',
      'test-token',
      engine,
      roomConnectOptionDefaults,
      roomOptionDefaults,
      new AbortController(),
    );

    expect(join).toHaveBeenCalledWith(
      'wss://test.livekit.io',
      'test-token',
      expect.objectContaining({
        clientInfoCapabilities: [ClientInfo_Capability.CAP_PACKET_TRAILER],
        e2eeEnabled: true,
      }),
      expect.any(AbortSignal),
      false,
    );
  });
});
