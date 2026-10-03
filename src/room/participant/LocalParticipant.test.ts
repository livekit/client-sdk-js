import { PacketTrailerFeature } from '@livekit/protocol';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import type { InternalRoomOptions } from '../../options';
import type RTCEngine from '../RTCEngine';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type OutgoingDataTrackManager from '../data-track/outgoing/OutgoingDataTrackManager';
import type { RpcClientManager, RpcServerManager } from '../rpc';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
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

type TrackEndedTestParticipant = {
  handleTrackEnded: (track: LocalTrack) => Promise<void>;
};

function createLocalParticipant(): TrackEndedTestParticipant {
  const engine = new EventEmitter() as unknown as RTCEngine;
  const participant = new LocalParticipant(
    'PA_test',
    'identity',
    engine,
    {} as InternalRoomOptions,
    {} as OutgoingDataStreamManager,
    {} as OutgoingDataTrackManager,
    {} as RpcClientManager,
    {} as RpcServerManager,
  );
  return participant as unknown as TrackEndedTestParticipant;
}

function makeEndedTrack(kind: Track.Kind, constraints: MediaTrackConstraints = {}) {
  return {
    kind,
    isLocal: true,
    isUserProvided: false,
    isMuted: false,
    sid: 'track-sid',
    source: kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
    mediaStreamID: 'stream-id',
    mediaStreamTrack: {
      enabled: true,
      id: 'media-track-id',
    },
    constraints,
    restartTrack: vi.fn().mockResolvedValue(undefined),
  } as unknown as LocalTrack;
}

describe('LocalParticipant track-ended device fallback', () => {
  it('falls back to the default device for a video track, preserving its other constraints', async () => {
    const participant = createLocalParticipant();
    const videoTrack = makeEndedTrack(Track.Kind.Video, {
      deviceId: 'the-camera-that-just-got-unplugged',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    });

    await participant.handleTrackEnded(videoTrack);

    expect(videoTrack.restartTrack).toHaveBeenCalledWith({
      deviceId: 'default',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    });
  });

  it('falls back to the default device for an audio track', async () => {
    const participant = createLocalParticipant();
    const audioTrack = makeEndedTrack(Track.Kind.Audio);

    await participant.handleTrackEnded(audioTrack);

    expect(audioTrack.restartTrack).toHaveBeenCalledWith({ deviceId: 'default' });
  });
});
