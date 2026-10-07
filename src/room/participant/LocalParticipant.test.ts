import { PacketTrailerFeature } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from '../DeviceManager';
import type LocalAudioTrack from '../track/LocalAudioTrack';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import { isChromiumBased, markDeviceAcquisitionFailure } from '../utils';
import LocalParticipant from './LocalParticipant';

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils');
  return {
    ...actual,
    isChromiumBased: vi.fn(() => true),
  };
});

type FrameMetadataTestParticipant = {
  canPublishFrameMetadata: () => boolean;
  log: { warn: ReturnType<typeof vi.fn> };
  normalizeRequestedFrameMetadataOptions: (
    track: LocalTrack,
    opts: TrackPublishOptions,
  ) => PacketTrailerFeature[];
};

function makeParticipant(canPublishFrameMetadata: boolean) {
  const participant = Object.create(LocalParticipant.prototype) as FrameMetadataTestParticipant;
  participant.canPublishFrameMetadata = () => canPublishFrameMetadata;
  participant.log = { warn: vi.fn() };
  return participant;
}

function makeTrack(kind: Track.Kind) {
  return {
    kind,
    sid: 'track-sid',
    source: kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
    isMuted: false,
    mediaStreamID: 'stream-id',
    mediaStreamTrack: {
      enabled: true,
      id: 'media-track-id',
    },
  } as unknown as LocalTrack;
}

describe('LocalParticipant frame metadata publish options', () => {
  it('normalizes requested video frame metadata options to advertised features', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true, frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(opts.frameMetadata).toEqual({ timestamp: true, frameId: true });
  });

  it('clears frame metadata options for non-video tracks', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { frameMetadata: { timestamp: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Audio),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
  });

  it('clears frame metadata options when publishing frame metadata is unsupported', () => {
    const participant = makeParticipant(false);
    const opts: TrackPublishOptions = { frameMetadata: { frameId: true } };

    const features = participant.normalizeRequestedFrameMetadataOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.frameMetadata).toBeUndefined();
    expect(participant.log.warn).toHaveBeenCalledOnce();
  });
});

type DefaultDeviceTestParticipant = {
  restartOnDefaultAudioDevice: (track: LocalAudioTrack) => Promise<void>;
  log: { debug: ReturnType<typeof vi.fn> };
};

function makeDefaultDeviceParticipant() {
  const participant = Object.create(
    LocalParticipant.prototype,
  ) as unknown as DefaultDeviceTestParticipant;
  participant.log = { debug: vi.fn() };
  return participant;
}

function errorNamed(name: string) {
  const e = new Error(name);
  e.name = name;
  markDeviceAcquisitionFailure(e);
  return e;
}

function makeAudioTrack(
  setDeviceId: ReturnType<typeof vi.fn>,
  restartTrack: ReturnType<typeof vi.fn> = vi.fn(),
  isStopped = false,
) {
  return {
    sid: 'track-sid',
    source: Track.Source.Microphone,
    setDeviceId,
    restartTrack,
    isStopped,
  } as unknown as LocalAudioTrack;
}

function stubAudioDevices(...deviceIds: string[]) {
  const getDevices = vi.fn().mockResolvedValue(deviceIds.map((deviceId) => ({ deviceId })));
  vi.spyOn(DeviceManager, 'getInstance').mockReturnValue({
    getDevices,
  } as unknown as DeviceManager);
  return getDevices;
}

describe('LocalParticipant restartOnDefaultAudioDevice', () => {
  beforeEach(() => {
    vi.mocked(isChromiumBased).mockReturnValue(true);
    stubAudioDevices('mic-1', 'mic-2');
  });

  it('falls back to an available device when the exact default is rejected', async () => {
    const getDevices = stubAudioDevices('mic-1', 'mic-2');
    const setDeviceId = vi.fn().mockRejectedValueOnce(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId));

    expect(getDevices).toHaveBeenCalledWith('audioinput', false);
    expect(setDeviceId).toHaveBeenCalledTimes(2);
    expect(setDeviceId).toHaveBeenNthCalledWith(1, { exact: 'default' });
    expect(setDeviceId).toHaveBeenNthCalledWith(2, 'mic-1');
  });

  it('falls back to the default id when no device is enumerated', async () => {
    stubAudioDevices();
    const setDeviceId = vi.fn().mockRejectedValueOnce(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId));

    expect(setDeviceId).toHaveBeenNthCalledWith(2, 'default');
  });

  it('falls back for a rejection name the spec does not prescribe', async () => {
    const setDeviceId = vi.fn().mockRejectedValueOnce(errorNamed('ConstraintNotSatisfiedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId));

    expect(setDeviceId).toHaveBeenCalledTimes(2);
  });

  it('does not retry a denied permission, so one prompt never becomes two', async () => {
    const setDeviceId = vi.fn().mockRejectedValue(errorNamed('NotAllowedError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId)),
    ).rejects.toThrow();

    expect(setDeviceId).toHaveBeenCalledOnce();
  });

  it('asks for the exact default only, when that succeeds', async () => {
    const setDeviceId = vi.fn().mockResolvedValue(undefined);
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId));

    expect(setDeviceId).toHaveBeenCalledOnce();
    expect(setDeviceId).toHaveBeenCalledWith({ exact: 'default' });
  });

  it('propagates the second rejection, not the first', async () => {
    const setDeviceId = vi
      .fn()
      .mockRejectedValueOnce(errorNamed('OverconstrainedError'))
      .mockRejectedValueOnce(errorNamed('NotReadableError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId)),
    ).rejects.toThrow('NotReadableError');

    expect(setDeviceId).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that happened after the device was acquired', async () => {
    const postAcquisition = new Error('processor restart failed');
    const setDeviceId = vi.fn().mockRejectedValue(postAcquisition);
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId)),
    ).rejects.toThrow('processor restart failed');

    expect(setDeviceId).toHaveBeenCalledOnce();
  });

  it('does not retry a track the user stopped while the first attempt was in flight', async () => {
    const setDeviceId = vi.fn().mockRejectedValue(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId, vi.fn(), true)),
    ).rejects.toThrow();

    expect(setDeviceId).toHaveBeenCalledOnce();
  });

  it('keeps the existing device id on a browser without a literal default', async () => {
    vi.mocked(isChromiumBased).mockReturnValue(false);
    const setDeviceId = vi.fn();
    const restartTrack = vi.fn().mockResolvedValue(undefined);
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId, restartTrack));

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(setDeviceId).not.toHaveBeenCalled();
  });

  it('switches device when a browser without a literal default cannot reacquire', async () => {
    vi.mocked(isChromiumBased).mockReturnValue(false);
    const setDeviceId = vi.fn();
    const restartTrack = vi.fn().mockRejectedValue(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(setDeviceId, restartTrack));

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(setDeviceId).toHaveBeenCalledExactlyOnceWith('mic-1');
  });
});
