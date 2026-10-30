import { afterEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from '../DeviceManager';
import type LocalVideoTrack from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import { markDeviceAcquisitionFailure } from '../utils';
import { LocalParticipant } from './LocalParticipant';

type VideoFallbackParticipant = {
  restartOnDefaultVideoDevice: (track: LocalVideoTrack) => Promise<void>;
  log: { debug: ReturnType<typeof vi.fn> };
};

function makeParticipant() {
  const participant = Object.create(
    LocalParticipant.prototype,
  ) as unknown as VideoFallbackParticipant;
  participant.log = { debug: vi.fn() };
  return participant;
}

function errorNamed(name: string) {
  const e = new Error(name);
  e.name = name;
  markDeviceAcquisitionFailure(e);
  return e;
}

function makeVideoTrack({
  deviceId,
  settingsDeviceId = 'external-cam',
  restartTrack = vi.fn(),
  restartWithoutCurrentDevice = vi.fn(),
  isStopped = false,
}: {
  deviceId?: ConstrainDOMString;
  settingsDeviceId?: string;
  restartTrack?: ReturnType<typeof vi.fn>;
  restartWithoutCurrentDevice?: ReturnType<typeof vi.fn>;
  isStopped?: boolean;
} = {}) {
  return {
    sid: 'video-sid',
    source: Track.Source.Camera,
    kind: Track.Kind.Video,
    isMuted: false,
    mediaStreamID: 'stream-1',
    mediaStreamTrack: { id: 'mst-1', enabled: true },
    constraints: {
      ...(deviceId !== undefined ? { deviceId } : {}),
      width: 1280,
      height: 720,
      facingMode: 'user',
    },
    getSourceTrackSettings: () => ({ deviceId: settingsDeviceId }),
    restartTrack,
    restartWithoutCurrentDevice,
    isStopped,
  } as unknown as LocalVideoTrack;
}

function stubCameras(...deviceIds: string[]) {
  const getDevices = vi.fn().mockResolvedValue(deviceIds.map((deviceId) => ({ deviceId })));
  vi.spyOn(DeviceManager, 'getInstance').mockReturnValue({
    getDevices,
  } as unknown as DeviceManager);
  return getDevices;
}

describe('LocalParticipant restartOnDefaultVideoDevice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the current camera when it can be reopened', async () => {
    const getDevices = stubCameras('built-in');
    const restartTrack = vi.fn().mockResolvedValue(undefined);
    const restartWithoutCurrentDevice = vi.fn();
    const participant = makeParticipant();

    await participant.restartOnDefaultVideoDevice(
      makeVideoTrack({
        deviceId: { exact: 'external-cam' },
        restartTrack,
        restartWithoutCurrentDevice,
      }),
    );

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(restartTrack).toHaveBeenCalledWith();
    expect(restartWithoutCurrentDevice).not.toHaveBeenCalled();
    expect(getDevices).not.toHaveBeenCalled();
  });

  it('drops the device id when that camera is no longer attached', async () => {
    const getDevices = stubCameras('built-in');
    const restartTrack = vi.fn().mockRejectedValue(errorNamed('OverconstrainedError'));
    const restartWithoutCurrentDevice = vi.fn().mockResolvedValue(undefined);
    const participant = makeParticipant();

    await participant.restartOnDefaultVideoDevice(
      makeVideoTrack({
        deviceId: { exact: 'external-cam' },
        restartTrack,
        restartWithoutCurrentDevice,
      }),
    );

    expect(getDevices).toHaveBeenCalledExactlyOnceWith('videoinput', false);
    expect(restartWithoutCurrentDevice).toHaveBeenCalledOnce();
  });

  it('falls back for a bare device id, which getUserMedia treats as exact', async () => {
    stubCameras('built-in');
    const restartWithoutCurrentDevice = vi.fn().mockResolvedValue(undefined);
    const participant = makeParticipant();

    await participant.restartOnDefaultVideoDevice(
      makeVideoTrack({
        deviceId: 'external-cam',
        restartTrack: vi.fn().mockRejectedValue(errorNamed('NotFoundError')),
        restartWithoutCurrentDevice,
      }),
    );

    expect(restartWithoutCurrentDevice).toHaveBeenCalledOnce();
  });

  it('does not open a different camera when the selected one is still attached', async () => {
    stubCameras('external-cam', 'built-in');
    const restartWithoutCurrentDevice = vi.fn();
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({
          deviceId: { exact: 'external-cam' },
          restartTrack: vi.fn().mockRejectedValue(errorNamed('NotReadableError')),
          restartWithoutCurrentDevice,
        }),
      ),
    ).rejects.toThrow('NotReadableError');

    expect(restartWithoutCurrentDevice).not.toHaveBeenCalled();
  });

  it('does not replace a camera when device ids cannot be read', async () => {
    stubCameras('', '');
    const restartWithoutCurrentDevice = vi.fn();
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({
          deviceId: { exact: 'external-cam' },
          restartTrack: vi.fn().mockRejectedValue(errorNamed('OverconstrainedError')),
          restartWithoutCurrentDevice,
        }),
      ),
    ).rejects.toThrow('OverconstrainedError');

    expect(restartWithoutCurrentDevice).not.toHaveBeenCalled();
  });

  it('does not retry a restart that already had no device id', async () => {
    const getDevices = stubCameras('built-in');
    const restartWithoutCurrentDevice = vi.fn();
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({
          restartTrack: vi.fn().mockRejectedValue(errorNamed('NotFoundError')),
          restartWithoutCurrentDevice,
        }),
      ),
    ).rejects.toThrow('NotFoundError');

    expect(getDevices).not.toHaveBeenCalled();
    expect(restartWithoutCurrentDevice).not.toHaveBeenCalled();
  });

  it('does not retry a denied permission', async () => {
    const getDevices = stubCameras('built-in');
    const restartTrack = vi.fn().mockRejectedValue(errorNamed('NotAllowedError'));
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({ deviceId: 'external-cam', restartTrack }),
      ),
    ).rejects.toThrow('NotAllowedError');

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(getDevices).not.toHaveBeenCalled();
  });

  it('does not retry a failure that happened after the device was acquired', async () => {
    const getDevices = stubCameras('built-in');
    const restartTrack = vi.fn().mockRejectedValue(new Error('processor restart failed'));
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({ deviceId: { exact: 'external-cam' }, restartTrack }),
      ),
    ).rejects.toThrow('processor restart failed');

    expect(getDevices).not.toHaveBeenCalled();
  });

  it('does not retry a track the user stopped while the first attempt was in flight', async () => {
    const getDevices = stubCameras('built-in');
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({
          deviceId: { exact: 'external-cam' },
          restartTrack: vi.fn().mockRejectedValue(errorNamed('OverconstrainedError')),
          isStopped: true,
        }),
      ),
    ).rejects.toThrow('OverconstrainedError');

    expect(getDevices).not.toHaveBeenCalled();
  });

  it('propagates the second rejection', async () => {
    stubCameras('built-in');
    const restartWithoutCurrentDevice = vi.fn().mockRejectedValue(errorNamed('NotReadableError'));
    const participant = makeParticipant();

    await expect(
      participant.restartOnDefaultVideoDevice(
        makeVideoTrack({
          deviceId: { exact: 'external-cam' },
          restartTrack: vi.fn().mockRejectedValue(errorNamed('OverconstrainedError')),
          restartWithoutCurrentDevice,
        }),
      ),
    ).rejects.toThrow('NotReadableError');
  });
});
