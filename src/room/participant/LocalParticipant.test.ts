import { PacketTrailerFeature } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { AudioCaptureOptions, TrackPublishOptions } from '../track/options';
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

type PreConnectBufferTestParticipant = Pick<LocalParticipant, 'setMicrophoneEnabled'> & {
  log: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  roomOptions: { publishDefaults?: TrackPublishOptions };
  pendingPublishing: Set<Track.Source>;
  getTrackPublication: ReturnType<typeof vi.fn>;
  createTracks: ReturnType<typeof vi.fn>;
  publishTrack: ReturnType<typeof vi.fn>;
};

function makeAudioTrackWithBufferSpy() {
  const track = makeTrack(Track.Kind.Audio) as LocalTrack & {
    startPreConnectBuffer: ReturnType<typeof vi.fn>;
  };
  track.startPreConnectBuffer = vi.fn();
  return track;
}

function makePreConnectParticipant(track: LocalTrack) {
  const participant = Object.create(LocalParticipant.prototype) as PreConnectBufferTestParticipant;
  participant.log = { debug: vi.fn(), info: vi.fn() };
  participant.roomOptions = { publishDefaults: {} };
  participant.pendingPublishing = new Set();
  participant.getTrackPublication = vi.fn().mockReturnValue(undefined);
  participant.createTracks = vi.fn().mockResolvedValue([track]);
  participant.publishTrack = vi.fn().mockResolvedValue(undefined);
  return participant;
}

describe('LocalParticipant preconnect buffer', () => {
  it('starts the preconnect buffer when preConnectBuffer is set in the publish options', async () => {
    const track = makeAudioTrackWithBufferSpy();
    const participant = makePreConnectParticipant(track);

    await participant.setMicrophoneEnabled(true, undefined, { preConnectBuffer: true });

    expect(track.startPreConnectBuffer).toHaveBeenCalledOnce();
  });

  it('does not start the preconnect buffer when preConnectBuffer is set in the capture options', async () => {
    const track = makeAudioTrackWithBufferSpy();
    const participant = makePreConnectParticipant(track);

    await participant.setMicrophoneEnabled(true, {
      preConnectBuffer: true,
    } as AudioCaptureOptions);

    expect(track.startPreConnectBuffer).not.toHaveBeenCalled();
  });
});
