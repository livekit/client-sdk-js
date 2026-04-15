import {
  type PacketTrailerMetadata,
  extractPacketTrailer,
  getFrameRtpTimestamp,
  getFrameSsrc,
} from '../../e2ee/packetTrailer';
import log from '../../logger';

const MAX_ENTRIES = 300;
const PACKET_TRAILER_FLAG = 'lk_pkt_trailer';

/**
 * Extracts and caches packet trailer metadata from received video frames.
 *
 * In the non-E2EE path, this sets up an Insertable Streams pipeline on the
 * receiver to strip trailers from encoded frames on the main thread.
 *
 * In the E2EE path, metadata is injected externally after the worker decrypts
 * and strips the trailer.
 *
 * Metadata is stored in an LRU map keyed by RTP timestamp so it can be
 * looked up when the frame is displayed.
 *
 * @experimental
 */
export class PacketTrailerExtractor {
  private metadataMap = new Map<number, PacketTrailerMetadata>();

  private insertionOrder: number[] = [];

  private activeSsrc: number = 0;

  storeMetadata(rtpTimestamp: number, ssrc: number, metadata: PacketTrailerMetadata) {
    // Simulcast layer switch: SSRC changed, flush stale entries from old layer.
    if (this.activeSsrc !== 0 && this.activeSsrc !== ssrc) {
      const keep: number[] = [];
      for (const ts of this.insertionOrder) {
        const m = this.metadataMap.get(ts);
        if (!m || (m as PacketTrailerMetadataInternal).ssrc !== ssrc) {
          this.metadataMap.delete(ts);
        } else {
          keep.push(ts);
        }
      }
      this.insertionOrder = keep;
    }
    this.activeSsrc = ssrc;

    const collision = this.metadataMap.has(rtpTimestamp);

    while (this.metadataMap.size >= MAX_ENTRIES && this.insertionOrder.length > 0) {
      const evicted = this.insertionOrder.shift()!;
      this.metadataMap.delete(evicted);
    }

    if (!collision) {
      this.insertionOrder.push(rtpTimestamp);
    }
    (metadata as PacketTrailerMetadataInternal).ssrc = ssrc;
    this.metadataMap.set(rtpTimestamp, metadata);
  }

  lookupMetadata(rtpTimestamp: number): PacketTrailerMetadata | undefined {
    return this.metadataMap.get(rtpTimestamp);
  }

  /**
   * Sets up an Insertable Streams pipeline on the receiver to extract
   * packet trailers from encoded video frames on the main thread.
   * Only used when E2EE is NOT active.
   */
  setupReceiver(receiver: RTCRtpReceiver): boolean {
    if (PACKET_TRAILER_FLAG in receiver) {
      return true;
    }

    if (!('createEncodedStreams' in receiver)) {
      log.debug('createEncodedStreams not supported, packet trailer extraction unavailable');
      return false;
    }

    // @ts-ignore — createEncodedStreams is not in standard typings
    const streams = receiver.createEncodedStreams();
    const extractor = this;

    const transform = new TransformStream({
      transform(
        frame: RTCEncodedVideoFrame,
        controller: TransformStreamDefaultController<RTCEncodedVideoFrame>,
      ) {
        const result = extractPacketTrailer(frame.data);
        if (result.metadata) {
          const rtpTimestamp = getFrameRtpTimestamp(frame);
          const ssrc = getFrameSsrc(frame);
          if (rtpTimestamp !== undefined) {
            extractor.storeMetadata(rtpTimestamp, ssrc, result.metadata);
          }
          frame.data = result.data.buffer.slice(
            result.data.byteOffset,
            result.data.byteOffset + result.data.byteLength,
          );
        }
        controller.enqueue(frame);
      },
    });

    streams.readable.pipeThrough(transform).pipeTo(streams.writable);

    // @ts-ignore
    receiver[PACKET_TRAILER_FLAG] = true;
    return true;
  }

  dispose() {
    this.metadataMap.clear();
    this.insertionOrder.length = 0;
    this.activeSsrc = 0;
  }
}

/** @internal */
interface PacketTrailerMetadataInternal extends PacketTrailerMetadata {
  ssrc?: number;
}
