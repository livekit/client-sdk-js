import type { PacketTrailerMetadata } from '../../packetTrailer/types';

const MAX_ENTRIES = 300;

/**
 * Caches packet trailer metadata extracted from received video frames,
 * keyed by RTP timestamp so it can be looked up when the frame is displayed.
 *
 * Metadata is populated either by the packet trailer worker managed by
 * `PacketTrailerManager` (non-E2EE) or by the E2EE FrameCryptor worker
 * after decryption (E2EE).
 *
 * @experimental
 */
export class PacketTrailerExtractor {
  private metadataMap = new Map<number, PacketTrailerMetadata>();

  private activeSsrc: number = 0;

  storeMetadata(rtpTimestamp: number, ssrc: number, metadata: PacketTrailerMetadata) {
    // Simulcast layer switch: SSRC changed, flush stale entries from old layer.
    if (this.activeSsrc !== 0 && this.activeSsrc !== ssrc) {
      this.metadataMap.clear();
    }
    this.activeSsrc = ssrc;

    while (this.metadataMap.size >= MAX_ENTRIES) {
      const evicted = this.metadataMap.keys().next().value!;
      this.metadataMap.delete(evicted);
    }

    this.metadataMap.set(rtpTimestamp, metadata);
  }

  lookupMetadata(rtpTimestamp: number): PacketTrailerMetadata | undefined {
    return this.metadataMap.get(rtpTimestamp);
  }

  dispose() {
    this.metadataMap.clear();
    this.activeSsrc = 0;
  }
}
