import type { TrackInfo } from '@livekit/protocol';
import log from '../logger';
import type Room from '../room/Room';
import { RoomEvent } from '../room/events';
import type RemoteTrack from '../room/track/RemoteTrack';
import type RemoteVideoTrack from '../room/track/RemoteVideoTrack';
import { PacketTrailerExtractor } from '../room/track/PacketTrailerExtractor';
import type { PTDecodeMessage, PTRemoveTransformMessage, PTWorkerMessage } from './types';

const PACKET_TRAILER_FLAG = 'lk_pkt_trailer';

export interface PacketTrailerOptions {
  worker: Worker;
}

/**
 * Manages packet trailer extraction for received video tracks.
 *
 * When a track's TrackInfo indicates packet trailer features, the manager
 * wires up an Insertable Streams pipeline (via a dedicated worker) to strip
 * the trailer from encoded frames and cache the metadata for lookup.
 *
 * When E2EE is active, the E2EE FrameCryptor worker handles trailer
 * extraction directly (before decryption), so this manager only creates
 * the extractor/metadata cache — no separate insertable-streams pipeline
 * is needed.
 *
 * @experimental
 */
export class PacketTrailerManager {
  private worker: Worker;

  private room?: Room;

  private extractors = new Map<string, PacketTrailerExtractor>();

  constructor(options: PacketTrailerOptions) {
    this.worker = options.worker;
  }

  /** @internal */
  setup(room: Room) {
    if (room === this.room) {
      return;
    }
    this.room = room;

    this.worker.onmessage = this.onWorkerMessage;
    this.worker.onerror = this.onWorkerError;
    this.worker.postMessage({ kind: 'init' });

    room
      .on(RoomEvent.TrackSubscribed, (track, pub, _participant) => {
        if (track.kind !== 'video') {
          return;
        }
        log.info('PacketTrailerManager: subscribed video track', {
          trackSid: pub.trackSid,
          packetTrailerFeatures: pub.trackInfo?.packetTrailerFeatures,
          trackInfo: pub.trackInfo,
        });
        this.setupReceiver(track as unknown as RemoteVideoTrack, pub.trackInfo);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.teardownTrack(track);
      });
  }

  private setupReceiver(track: RemoteVideoTrack, _trackInfo?: TrackInfo) {
    if (!track.receiver) {
      return;
    }

    if (PACKET_TRAILER_FLAG in track.receiver) {
      return;
    }

    const extractor = new PacketTrailerExtractor();
    const trackId = track.mediaStreamID;

    this.extractors.set(trackId, extractor);
    track.packetTrailerExtractor = extractor;

    const hasE2EE = !!this.room?.hasE2EESetup;

    if (hasE2EE) {
      // When E2EE is active, the FrameCryptor worker strips the trailer
      // inside its decodeFunction before decryption and sends metadata
      // back via the E2EEManager. No separate pipeline is needed here;
      // we only create the extractor/cache above.
      return;
    }

    const receiver = track.receiver;

    if (!('createEncodedStreams' in receiver)) {
      log.warn(
        'createEncodedStreams not supported, packet trailer extraction unavailable',
      );
      return;
    }

    // @ts-ignore -- createEncodedStreams is not in standard typings
    const streams = receiver.createEncodedStreams();

    const msg: PTDecodeMessage = {
      kind: 'decode',
      data: {
        readableStream: streams.readable,
        writableStream: streams.writable,
        trackId,
      },
    };
    this.worker.postMessage(msg, [streams.readable, streams.writable]);

    // @ts-ignore
    receiver[PACKET_TRAILER_FLAG] = true;
  }

  private teardownTrack(track: RemoteTrack) {
    const trackId = track.mediaStreamID;
    const extractor = this.extractors.get(trackId);
    if (extractor) {
      extractor.dispose();
      this.extractors.delete(trackId);
    }

    if (!this.room?.hasE2EESetup) {
      const msg: PTRemoveTransformMessage = {
        kind: 'removeTransform',
        data: { trackId },
      };
      this.worker.postMessage(msg);
    }
  }

  private onWorkerMessage = (ev: MessageEvent<PTWorkerMessage>) => {
    const msg = ev.data;
    if (msg.kind === 'metadata') {
      const extractor = this.extractors.get(msg.data.trackId);
      if (extractor) {
        extractor.storeMetadata(msg.data.rtpTimestamp, msg.data.ssrc, msg.data.metadata);
      }
    }
  };

  private onWorkerError = (ev: ErrorEvent) => {
    log.error('packet trailer worker encountered an error:', { error: ev.error });
  };
}
