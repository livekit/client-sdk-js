import type { PacketTrailerMetadata } from '../../packetTrailer/types';

const MAX_ENTRIES = 300;

/**
 * Caches packet trailer metadata extracted from received video frames,
 * keyed by RTP timestamp so it can be looked up when the frame is displayed.
 *
 * Metadata is populated either by the main-thread pipeline installed by
 * `PacketTrailerManager` (non-E2EE) or by the E2EE FrameCryptor worker
 * after decryption (E2EE).
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
