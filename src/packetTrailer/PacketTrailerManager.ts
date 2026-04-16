import type { TrackInfo } from '@livekit/protocol';
import log from '../logger';
import type Room from '../room/Room';
import { RoomEvent } from '../room/events';
import { PacketTrailerExtractor } from '../room/track/PacketTrailerExtractor';
import type RemoteTrack from '../room/track/RemoteTrack';
import RemoteVideoTrack from '../room/track/RemoteVideoTrack';
import type { PTDecodeMessage, PTUpdateTrackIdMessage, PTWorkerMessage } from './types';

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

  /**
   * Maps each receiver that has had its encoded streams transferred to
   * the worker to the trackId currently associated with that pipeline.
   * Used to detect receiver reuse (transceiver recycling) so we can
   * update the worker's trackId instead of trying to re-transfer the
   * already-consumed streams.
   */
  private receiverPipelines = new Map<RTCRtpReceiver, string>();

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
      })
      .on(RoomEvent.Disconnected, () => {
        this.cleanup();
      });
  }

  private setupReceiver(track: RemoteVideoTrack, _trackInfo?: TrackInfo) {
    if (!track.receiver) {
      return;
    }

    const extractor = new PacketTrailerExtractor();
    const newTrackId = track.mediaStreamID;

    this.extractors.set(newTrackId, extractor);
    track.packetTrailerExtractor = extractor;

    const hasE2EE = !!this.room?.hasE2EESetup;

    if (hasE2EE) {
      return;
    }

    const receiver = track.receiver;
    const existingTrackId = this.receiverPipelines.get(receiver);

    if (existingTrackId) {
      // Receiver is reused (transceiver recycled). The worker already
      // owns the encoded streams — just remap the trackId so metadata
      // is keyed correctly and re-activate processing.
      log.info('PacketTrailerManager: reusing pipeline for receiver', {
        oldTrackId: existingTrackId,
        newTrackId,
      });
      const msg: PTUpdateTrackIdMessage = {
        kind: 'updateTrackId',
        data: { oldTrackId: existingTrackId, newTrackId },
      };
      this.worker.postMessage(msg);
      this.receiverPipelines.set(receiver, newTrackId);
      return;
    }

    // @ts-ignore
    const readable: ReadableStream | undefined = receiver.readableStream;
    // @ts-ignore
    const writable: WritableStream | undefined = receiver.writableStream;

    if (!readable || !writable) {
      log.warn(
        'encoded streams not available on receiver — ensure encodedInsertableStreams is enabled',
      );
      return;
    }

    const msg: PTDecodeMessage = {
      kind: 'decode',
      data: {
        readableStream: readable,
        writableStream: writable,
        trackId: newTrackId,
      },
    };
    this.worker.postMessage(msg, [readable, writable]);
    this.receiverPipelines.set(receiver, newTrackId);
  }

  private teardownTrack(track: RemoteTrack) {
    const trackId = track.mediaStreamID;
    const extractor = this.extractors.get(trackId);
    if (extractor) {
      extractor.dispose();
      this.extractors.delete(trackId);
    }

    if (track instanceof RemoteVideoTrack) {
      track.packetTrailerExtractor = undefined;
    }

    // The worker pipeline is intentionally left running on the receiver. If the
    // receiver is reused for a new track, `setupReceiver` will send an
    // `updateTrackId` to remap it. If the room disconnects, `cleanup` terminates
    // the worker entirely. Any metadata posted in the meantime is dropped because
    // the extractor lookup above has already been removed.
  }

  private cleanup() {
    for (const extractor of this.extractors.values()) {
      extractor.dispose();
    }
    this.extractors.clear();
    this.receiverPipelines.clear();
    this.worker.terminate();
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
