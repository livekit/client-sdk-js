import type { TrackInfo } from '@livekit/protocol';
import log from '../logger';
import type Room from '../room/Room';
import { RoomEvent } from '../room/events';
import { PacketTrailerExtractor } from '../room/track/PacketTrailerExtractor';
import type RemoteTrack from '../room/track/RemoteTrack';
import RemoteVideoTrack from '../room/track/RemoteVideoTrack';
import { extractPacketTrailer, getFrameRtpTimestamp, getFrameSsrc } from './packetTrailer';
import type { PTDecodeMessage, PTUpdateTrackIdMessage, PTWorkerMessage } from './types';

export interface PacketTrailerOptions {
  /**
   * Optional dedicated worker for extracting packet trailers off the main thread.
   *
   * When provided, encoded video streams are transferred to the worker for
   * processing, which avoids any per-frame work on the main thread and is the
   * recommended configuration for production.
   *
   * When omitted, the manager falls back to an inline `TransformStream` on the
   * main thread. This is a safety net so video still decodes correctly if the
   * worker wasn't wired up but a publishing track advertises packet trailer
   * features — at a small CPU cost on the subscriber.
   */
  worker?: Worker;
}

/** @internal */
const PACKET_TRAILER_FLAG = 'lk_pkt_trailer';

/** Mutable pipeline state so the transform closure can be remapped when a receiver is reused. */
interface MainThreadPipelineState {
  extractor: PacketTrailerExtractor;
}

/**
 * Manages packet trailer extraction for received video tracks.
 *
 * When a track's TrackInfo indicates packet trailer features, the manager
 * wires up an Insertable Streams pipeline to strip the trailer from encoded
 * frames and cache the metadata for lookup.
 *
 * Two processing modes are supported:
 *   - **Worker** (preferred): encoded streams are transferred to a dedicated
 *     worker. No per-frame work happens on the main thread.
 *   - **Main-thread fallback**: if no worker was supplied, the transform runs
 *     inline. Slightly higher main-thread cost, but ensures video still
 *     decodes correctly when the worker was not wired up.
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

  /**
   * Tracks the active main-thread pipeline state for each receiver. When a
   * receiver is reused for a new track, the state's extractor is swapped
   * in-place so the existing `TransformStream` keeps feeding the correct
   * extractor without re-calling `createEncodedStreams` (which would throw).
   */
  private mainThreadPipelines = new Map<RTCRtpReceiver, MainThreadPipelineState>();

  /** Ensures the "no worker, using main-thread fallback" warning only fires once per room. */
  private mainThreadFallbackWarned = false;

  constructor(options: PacketTrailerOptions = {}) {
    this.worker = options.worker;
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

    log.debug('PacketTrailerManager: installing pipeline', {
      trackSid: track.sid,
      mode: this.worker ? 'worker' : 'main-thread',
    });

    if (this.worker) {
      this.setupWorkerReceiver(receiver, trackId);
    } else {
      if (!this.mainThreadFallbackWarned) {
        log.warn(
          'subscribed to a track with packet trailer features but no packet trailer worker ' +
            'is configured — falling back to main-thread frame processing. For best performance ' +
            'pass `packetTrailer: { worker }` in RoomOptions.',
        );
        this.mainThreadFallbackWarned = true;
      }
      this.setupMainThreadReceiver(receiver, extractor);
    }
  }

  private setupWorkerReceiver(receiver: RTCRtpReceiver, newTrackId: string) {
    const worker = this.worker!;
    const existingTrackId = this.workerPipelines.get(receiver);

    if (existingTrackId) {
      // Receiver is reused (transceiver recycled). The worker already owns
      // the encoded streams — just remap the trackId so metadata is keyed
      // correctly and re-activate processing.
      const msg: PTUpdateTrackIdMessage = {
        kind: 'updateTrackId',
        data: { oldTrackId: existingTrackId, newTrackId },
      };
      worker.postMessage(msg);
      this.workerPipelines.set(receiver, newTrackId);
      return;
    }

    if (!('createEncodedStreams' in receiver)) {
      log.warn('createEncodedStreams not supported, packet trailer extraction unavailable');
      return;
    }

    let streams: { readable: ReadableStream; writable: WritableStream };
    try {
      // @ts-ignore — createEncodedStreams is not in standard typings
      streams = receiver.createEncodedStreams();
    } catch (err) {
      log.warn('failed to create encoded streams for packet trailer extraction', { error: err });
      return;
    }

    const msg: PTDecodeMessage = {
      kind: 'decode',
      data: {
        readableStream: streams.readable,
        writableStream: streams.writable,
        trackId: newTrackId,
      },
    };
    worker.postMessage(msg, [streams.readable, streams.writable]);
    this.workerPipelines.set(receiver, newTrackId);
  }

  private setupMainThreadReceiver(receiver: RTCRtpReceiver, extractor: PacketTrailerExtractor) {
    const existingState = this.mainThreadPipelines.get(receiver);
    if (existingState) {
      // Receiver was reused for a new track. The pipeline is still running
      // on the already-transferred encoded streams — just swap the extractor
      // the transform feeds into.
      existingState.extractor = extractor;
      return;
    }

    if (PACKET_TRAILER_FLAG in receiver) {
      return;
    }
    if (!('createEncodedStreams' in receiver)) {
      log.debug('createEncodedStreams not supported, packet trailer extraction unavailable');
      return;
    }

    let streams: { readable: ReadableStream; writable: WritableStream };
    try {
      // @ts-ignore — createEncodedStreams is not in standard typings
      streams = receiver.createEncodedStreams();
    } catch (err) {
      log.warn('failed to create encoded streams for packet trailer extraction', { error: err });
      return;
    }

    const state: MainThreadPipelineState = { extractor };
    this.mainThreadPipelines.set(receiver, state);

    const transform = new TransformStream<RTCEncodedVideoFrame, RTCEncodedVideoFrame>({
      transform: (frame, controller) => {
        try {
          const result = extractPacketTrailer(frame.data);
          if (result.metadata) {
            const rtpTimestamp = getFrameRtpTimestamp(frame);
            const ssrc = getFrameSsrc(frame);
            if (rtpTimestamp !== undefined) {
              state.extractor.storeMetadata(rtpTimestamp, ssrc, result.metadata);
            }
            frame.data = result.data.buffer.slice(
              result.data.byteOffset,
              result.data.byteOffset + result.data.byteLength,
            ) as ArrayBuffer;
          }
        } catch (err) {
          // Never drop frames on trailer-extraction failure — pass through so
          // video keeps decoding even if metadata is lost for this frame.
          log.debug('packet trailer extraction failed, passing frame through', { error: err });
        }
        controller.enqueue(frame);
      },
    });

    streams.readable
      .pipeThrough(transform)
      .pipeTo(streams.writable)
      .catch((err) => {
        log.debug('packet trailer pipeline ended', { error: err });
      });

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

    if (track instanceof RemoteVideoTrack) {
      track.packetTrailerExtractor = undefined;
    }

    // The receiver pipeline (worker or main-thread) is intentionally left
    // running. If the receiver is reused for a new track, `setupReceiver` will
    // remap it. If the room disconnects, `cleanup` drops all state. Any
    // metadata produced in the meantime is harmless — the extractor above has
    // already been disposed and is no longer reachable from any track.
  }

  private cleanup() {
    for (const extractor of this.extractors.values()) {
      extractor.dispose();
    }
    this.extractors.clear();
    this.workerPipelines.clear();
    this.mainThreadPipelines.clear();
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
