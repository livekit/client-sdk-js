import type { FrameMetadata } from '../../frameMetadata/types';

const MAX_ENTRIES = 300;

/**
 * Caches frame metadata extracted from received video frames,
 * keyed by RTP timestamp so it can be looked up when the frame is displayed.
 *
 * Metadata is populated either by the frame metadata worker managed by
 * `FrameMetadataManager` (non-E2EE) or by the E2EE FrameCryptor worker
 * after decryption (E2EE).
 *
 * @experimental
 */
export class FrameMetadataExtractor {
  private metadataMap = new Map<number, FrameMetadata>();

  private activeSsrc: number = 0;

  storeMetadata(rtpTimestamp: number, ssrc: number, metadata: FrameMetadata) {
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

  lookupMetadata(rtpTimestamp: number): FrameMetadata | undefined {
    return this.metadataMap.get(rtpTimestamp);
  }

  dispose() {
    this.metadataMap.clear();
    this.activeSsrc = 0;
  }
}
