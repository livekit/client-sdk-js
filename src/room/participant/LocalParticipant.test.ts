import { PacketTrailerFeature } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import type LocalTrack from '../track/LocalTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import LocalParticipant from './LocalParticipant';

type PacketTrailerTestParticipant = {
  canPublishPacketTrailer: () => boolean;
  log: { warn: ReturnType<typeof vi.fn> };
  normalizeRequestedPacketTrailerOptions: (
    track: LocalTrack,
    opts: TrackPublishOptions,
  ) => PacketTrailerFeature[];
};

function makeParticipant(canPublishPacketTrailer: boolean) {
  const participant = Object.create(LocalParticipant.prototype) as PacketTrailerTestParticipant;
  participant.canPublishPacketTrailer = () => canPublishPacketTrailer;
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

describe('LocalParticipant packet trailer publish options', () => {
  it('normalizes requested video packet trailer options to advertised features', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { packetTrailer: { timestamp: true, frameId: true } };

    const features = participant.normalizeRequestedPacketTrailerOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(opts.packetTrailer).toEqual({ timestamp: true, frameId: true });
  });

  it('clears packet trailer options for non-video tracks', () => {
    const participant = makeParticipant(true);
    const opts: TrackPublishOptions = { packetTrailer: { timestamp: true } };

    const features = participant.normalizeRequestedPacketTrailerOptions(
      makeTrack(Track.Kind.Audio),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.packetTrailer).toBeUndefined();
  });

  it('clears packet trailer options when publishing packet trailers is unsupported', () => {
    const participant = makeParticipant(false);
    const opts: TrackPublishOptions = { packetTrailer: { frameId: true } };

    const features = participant.normalizeRequestedPacketTrailerOptions(
      makeTrack(Track.Kind.Video),
      opts,
    );

    expect(features).toEqual([]);
    expect(opts.packetTrailer).toBeUndefined();
    expect(participant.log.warn).toHaveBeenCalledOnce();
  });
});
