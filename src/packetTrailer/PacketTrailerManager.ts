import type { TrackInfo } from '@livekit/protocol';
import log from '../logger';
import type Room from '../room/Room';
import { RoomEvent } from '../room/events';
import { PacketTrailerExtractor } from '../room/track/PacketTrailerExtractor';
import type RemoteTrack from '../room/track/RemoteTrack';
import RemoteVideoTrack from '../room/track/RemoteVideoTrack';
import type { PTDecodeMessage, PTUpdateTrackIdMessage, PTWorkerMessage } from './types';
import { isPacketTrailerSupported, shouldUsePacketTrailerScriptTransform } from './utils';

export interface PacketTrailerOptions {
  /**
   * Dedicated worker for extracting packet trailers off the main thread.
   *
   * Encoded video streams are transferred to the worker for processing, which
   * avoids per-frame work on the main thread.
   */
  worker: Worker;
}

/**
 * Manages packet trailer extraction for received video tracks.
 *
 * When a track's TrackInfo indicates packet trailer features, the manager
 * wires up an encoded frame transform to strip the trailer from encoded frames
 * and cache the metadata for lookup.
 *
 * Packet trailer extraction is worker-only. If no worker is configured, the
 * SDK does not advertise packet trailer support and skips extraction.
 *
 * When E2EE is active, the E2EE FrameCryptor worker handles trailer
 * extraction directly (before decryption), so this manager only creates
 * the extractor/metadata cache — no separate pipeline is installed.
 *
 * @experimental
 */
export class PacketTrailerManager {
  private worker?: Worker;

  private room?: Room;

  private extractors = new Map<string, PacketTrailerExtractor>();

  /**
   * Tracks the trackId associated with each receiver that has had its
   * encoded streams handed off to the worker. Used to detect receiver
   * reuse (transceiver recycling) so we can remap trackIds instead of
   * re-transferring already-consumed streams.
   */
  private workerPipelines = new Map<RTCRtpReceiver, string>();

  constructor(options?: PacketTrailerOptions) {
    this.worker = options?.worker;
  }

  /** @internal */
  setup(room: Room) {
    if (room === this.room) {
      return;
    }
    this.room = room;

    if (this.worker) {
      this.worker.onmessage = this.onWorkerMessage;
      this.worker.onerror = this.onWorkerError;
      this.worker.postMessage({ kind: 'init' });
    }

    room
      .on(RoomEvent.TrackSubscribed, (track, pub, _participant) => {
        if (track.kind !== 'video') {
          return;
        }
        this.setupReceiver(track as unknown as RemoteVideoTrack, pub.trackInfo);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.teardownTrack(track);
      })
      .on(RoomEvent.Disconnected, () => {
        this.cleanup();
      });
  }

  private setupReceiver(track: RemoteVideoTrack, trackInfo?: TrackInfo) {
    const receiver = track.receiver;
    if (!receiver) {
      return;
    }

    // Only install a pipeline for tracks that actually advertise packet
    // trailer features. This keeps us out of the way for tracks published by
    // clients on older protocols or that don't opt into the feature.
    const hasFeatures =
      !!trackInfo?.packetTrailerFeatures && trackInfo.packetTrailerFeatures.length > 0;
    if (!hasFeatures) {
      if (!this.room?.hasE2EESetup) {
        this.setupPassthroughReceiver(receiver, track.mediaStreamID);
      }
      return;
    }

    if (
      !isPacketTrailerSupported(this.worker ? { worker: this.worker } : undefined) &&
      !this.room?.hasE2EESetup
    ) {
      log.warn('packet trailer transform not supported; skipping extraction');
      return;
    }

    const extractor = new PacketTrailerExtractor();
    const trackId = track.mediaStreamID;

    this.extractors.set(trackId, extractor);
    track.packetTrailerExtractor = extractor;

    if (this.room?.hasE2EESetup) {
      // E2EE worker strips the trailer and injects metadata directly into
      // the extractor via E2eeManager; no pipeline is needed here.
      return;
    }

    this.setupWorkerReceiver(receiver, trackId, true);
  }

  private setupPassthroughReceiver(receiver: RTCRtpReceiver, trackId: string) {
    if (shouldUsePacketTrailerScriptTransform()) {
      if ('transform' in receiver) {
        // @ts-ignore
        receiver.transform = null;
      }
      return;
    }

    if (
      this.worker &&
      isPacketTrailerSupported({ worker: this.worker }) &&
      !this.workerPipelines.has(receiver)
    ) {
      this.setupWorkerReceiver(receiver, trackId, false);
      return;
    }

    if (this.worker && this.workerPipelines.has(receiver)) {
      this.setupWorkerReceiver(receiver, trackId, false);
    }
  }

  private setupWorkerReceiver(
    receiver: RTCRtpReceiver,
    newTrackId: string,
    hasPacketTrailer = true,
  ) {
    const worker = this.worker;
    if (!worker) {
      return;
    }

    if (shouldUsePacketTrailerScriptTransform()) {
      // @ts-ignore
      receiver.transform = new RTCRtpScriptTransform(worker, {
        kind: 'decode',
        trackId: newTrackId,
      });
      return;
    }

    const existingTrackId = this.workerPipelines.get(receiver);

    if (existingTrackId) {
      // Receiver is reused (transceiver recycled). The worker already owns
      // the encoded streams — just remap the trackId so metadata is keyed
      // correctly and re-activate processing.
      const msg: PTUpdateTrackIdMessage = {
        kind: 'updateTrackId',
        data: { oldTrackId: existingTrackId, newTrackId, hasPacketTrailer },
      };
      worker.postMessage(msg);
      this.workerPipelines.set(receiver, newTrackId);
      return;
    }

    if (!('createEncodedStreams' in receiver)) {
      log.warn('createEncodedStreams not supported');
      return;
    }

    let streams: { readable: ReadableStream; writable: WritableStream };
    try {
      // @ts-ignore — createEncodedStreams is not in standard typings
      streams = receiver.createEncodedStreams();
    } catch (err) {
      log.warn('failed to create encoded streams', { error: err });
      return;
    }

    const msg: PTDecodeMessage = {
      kind: 'decode',
      data: {
        readableStream: streams.readable,
        writableStream: streams.writable,
        trackId: newTrackId,
        hasPacketTrailer,
      },
    };
    worker.postMessage(msg, [streams.readable, streams.writable]);
    this.workerPipelines.set(receiver, newTrackId);
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

    // The receiver pipeline is intentionally left running. If the receiver is
    // reused for a new track, `setupReceiver` will remap it. If the room
    // disconnects, `cleanup` drops all state. Any metadata produced in the
    // meantime is harmless — the extractor above has already been disposed and
    // is no longer reachable from any track.
  }

  private cleanup() {
    for (const extractor of this.extractors.values()) {
      extractor.dispose();
    }
    this.extractors.clear();
    this.workerPipelines.clear();
    this.worker?.terminate();
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
