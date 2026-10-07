import { PacketTrailerFeature } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import type LocalAudioTrack from '../track/LocalAudioTrack';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import { markDeviceAcquisitionFailure } from '../utils';
import LocalParticipant from './LocalParticipant';

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

function makeAudioTrack(restartTrack: ReturnType<typeof vi.fn>, isStopped = false) {
  return {
    sid: 'track-sid',
    source: Track.Source.Microphone,
    restartTrack,
    isStopped,
  } as unknown as LocalAudioTrack;
}

describe('LocalParticipant restartOnDefaultAudioDevice', () => {
  it('falls back to the soft constraint when the exact default is rejected', async () => {
    const restartTrack = vi.fn().mockRejectedValueOnce(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack));

    expect(restartTrack).toHaveBeenCalledTimes(2);
    expect(restartTrack).toHaveBeenNthCalledWith(1, { deviceId: { exact: 'default' } });
    expect(restartTrack).toHaveBeenNthCalledWith(2, { deviceId: { ideal: 'default' } });
  });

  it('falls back for a rejection name the spec does not prescribe', async () => {
    const restartTrack = vi.fn().mockRejectedValueOnce(errorNamed('ConstraintNotSatisfiedError'));
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack));

    expect(restartTrack).toHaveBeenCalledTimes(2);
  });

  it('does not retry a denied permission, so one prompt never becomes two', async () => {
    const restartTrack = vi.fn().mockRejectedValue(errorNamed('NotAllowedError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack)),
    ).rejects.toThrow();

    expect(restartTrack).toHaveBeenCalledOnce();
  });

  it('asks for the exact default only, when that succeeds', async () => {
    const restartTrack = vi.fn().mockResolvedValue(undefined);
    const participant = makeDefaultDeviceParticipant();

    await participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack));

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'default' } });
  });

  it('propagates the second rejection, not the first', async () => {
    const restartTrack = vi
      .fn()
      .mockRejectedValueOnce(errorNamed('OverconstrainedError'))
      .mockRejectedValueOnce(errorNamed('NotReadableError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack)),
    ).rejects.toThrow('NotReadableError');

    expect(restartTrack).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that happened after the device was acquired', async () => {
    const postAcquisition = new Error('processor restart failed');
    const restartTrack = vi.fn().mockRejectedValue(postAcquisition);
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack)),
    ).rejects.toThrow('processor restart failed');

    expect(restartTrack).toHaveBeenCalledOnce();
  });

  it('does not retry a track the user stopped while the first attempt was in flight', async () => {
    const restartTrack = vi.fn().mockRejectedValue(errorNamed('OverconstrainedError'));
    const participant = makeDefaultDeviceParticipant();

    await expect(
      participant.restartOnDefaultAudioDevice(makeAudioTrack(restartTrack, true)),
    ).rejects.toThrow();

    expect(restartTrack).toHaveBeenCalledOnce();
  });
});
