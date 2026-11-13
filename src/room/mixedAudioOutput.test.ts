import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreRoom } from './CoreRoom';
import { Room } from './Room';
import { RoomEvent } from './events';
import RemoteParticipant from './participant/RemoteParticipant';
import { Future } from './utils';

// Both source entry points share output routing; no built artifacts are needed.
describe.each([
  { name: 'Room', RoomClass: Room },
  { name: 'CoreRoom', RoomClass: CoreRoom },
])('$name mixed audio output', ({ RoomClass }) => {
  let room: CoreRoom;
  let route: Future<void, Error>;
  let setSinkId: ReturnType<typeof vi.fn>;
  let setAudioOutput: ReturnType<typeof vi.spyOn>;
  let deviceChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    route = new Future<void, Error>();
    setSinkId = vi.fn(() => route.promise);
    room = new RoomClass({ webAudioMix: true });
    // Set the initial selection after construction to avoid an automatic output switch.
    room.options.audioOutput = { deviceId: 'speaker-a' };
    room.localParticipant.activeDeviceMap.set('audiooutput', 'speaker-a');
    (room as unknown as { audioContext: unknown }).audioContext = { setSinkId };

    const participant = new RemoteParticipant(room.engine.client, 'participant', 'listener');
    setAudioOutput = vi.spyOn(participant, 'setAudioOutput').mockResolvedValue(undefined);
    room.remoteParticipants.set(participant.identity, participant);
    deviceChanged = vi.fn();
    room.on(RoomEvent.ActiveDeviceChanged, deviceChanged);
  });

  afterEach(async () => {
    route.resolve?.();
    await room.dispose();
    room.removeAllListeners();
    room.localParticipant.removeAllListeners();
    vi.restoreAllMocks();
  });

  it('confirms the output only after the AudioContext route succeeds', async () => {
    const settled = vi.fn();
    const switching = room.switchActiveDevice('audiooutput', 'speaker-b').then((result) => {
      settled();
      return result;
    });
    // Let device normalization and any premature completion finish before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setSinkId).toHaveBeenCalledExactlyOnceWith('speaker-b');
    expect(settled).not.toHaveBeenCalled();
    expect(room.getActiveDevice('audiooutput')).toBe('speaker-a');
    expect(deviceChanged).not.toHaveBeenCalled();
    expect(setAudioOutput).not.toHaveBeenCalled();

    route.resolve?.();
    await expect(switching).resolves.toBe(true);
    expect(room.getActiveDevice('audiooutput')).toBe('speaker-b');
    expect(room.options.audioOutput.deviceId).toBe('speaker-b');
    expect(deviceChanged).toHaveBeenCalledExactlyOnceWith('audiooutput', 'speaker-b');
    expect(setAudioOutput).toHaveBeenCalledExactlyOnceWith({ deviceId: 'speaker-b' });
  });

  it('propagates a routing rejection, preserves the selection, and permits retry', async () => {
    const failure = new Error('AudioContext output rejected');
    const switching = room.switchActiveDevice('audiooutput', 'speaker-b');
    // Observe rejection before rejecting the browser promise. Vitest also reports any
    // detached, unhandled setSinkId rejection as a test failure.
    const outcome = switching.catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    route.reject?.(failure);

    expect(await outcome).toBe(failure);
    expect(room.options.audioOutput.deviceId).toBe('speaker-a');
    expect(room.getActiveDevice('audiooutput')).toBe('speaker-a');
    expect(deviceChanged).not.toHaveBeenCalled();
    expect(setAudioOutput).not.toHaveBeenCalled();

    route = new Future<void, Error>();
    const retry = room.switchActiveDevice('audiooutput', 'speaker-b');
    route.resolve?.();
    await expect(retry).resolves.toBe(true);
    expect(setSinkId.mock.calls).toEqual([['speaker-b'], ['speaker-b']]);
    expect(room.options.audioOutput.deviceId).toBe('speaker-b');
    expect(room.getActiveDevice('audiooutput')).toBe('speaker-b');
    expect(deviceChanged).toHaveBeenCalledExactlyOnceWith('audiooutput', 'speaker-b');
    expect(setAudioOutput).toHaveBeenCalledExactlyOnceWith({ deviceId: 'speaker-b' });
  });
});
