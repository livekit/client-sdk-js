import { ClientInfo_Capability, JoinResponse } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('Room lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Tear down the mocked mediaDevices so other tests see the env they
    // expected (happy-dom does not provide navigator.mediaDevices by default).
    if ((navigator as { mediaDevices?: unknown }).mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
    }
  });

  it('removes the constructor-registered devicechange listener on disconnect, even when the room never connected (#1940)', async () => {
    // happy-dom does not provide navigator.mediaDevices. Install a minimal
    // EventTarget stand-in so the constructor takes the listener-registration
    // branch and we can observe the resulting AbortSignal.
    const mediaDevices = new EventTarget() as EventTarget & {
      addEventListener: EventTarget['addEventListener'];
      removeEventListener: EventTarget['removeEventListener'];
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });

    const addSpy = vi.spyOn(mediaDevices, 'addEventListener');

    const room = new Room();

    // Constructor must register exactly one devicechange listener.
    const deviceChangeAdds = addSpy.mock.calls.filter(([type]) => type === 'devicechange');
    expect(deviceChangeAdds).toHaveLength(1);

    // The registration must opt in to AbortSignal-based teardown.
    const addOptions = deviceChangeAdds[0][2] as AddEventListenerOptions | undefined;
    expect(addOptions).toBeDefined();
    const signal = addOptions!.signal as AbortSignal | undefined;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);

    // disconnect() on a freshly-constructed room hits the
    // `state === Disconnected` short-circuit. Without the fix, nothing
    // aborts the constructor's AbortController, and the listener leaks.
    await room.disconnect();

    expect(signal!.aborted).toBe(true);

    // Idempotency: calling disconnect again must not throw.
    await room.disconnect();
    expect(signal!.aborted).toBe(true);
  });
});
