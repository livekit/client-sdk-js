/**
 * Reserved data-stream header attribute used to "smuggle" a small payload directly inside a single
 * `streamHeader` packet, avoiding the separate `streamChunk`/`streamTrailer` packets a normal data
 * stream requires. For text streams the value is the raw string; for byte streams it is base64.
 *
 * @internal
 */
export const INLINE_PAYLOAD_ATTRIBUTE = 'lk.inline_payload';

/**
 * Maximum size of a single data-stream chunk in bytes, and the budget used to decide whether a
 * payload can be sent inline as a single header packet. Kept below the ~16k data-channel MTU to
 * leave headroom for protocol framing and E2EE overhead.
 *
 * @internal
 */
export const STREAM_CHUNK_SIZE_BYTES = 15_000;

/**
 * Reserved data-stream header attribute signaling that the payload (inline or chunked) is
 * compressed. Self-describing: the sender sets it when it compresses, and the receiver decompresses
 * iff it is present. Inline payloads and chunked text streams use
 * {@link COMPRESSION_DEFLATE_RAW}; chunked byte streams still use the legacy
 * {@link COMPRESSION_GZIP} member scheme.
 *
 * @internal
 */
export const COMPRESSION_ATTRIBUTE = 'lk.compression';

/**
 * Value of {@link COMPRESSION_ATTRIBUTE} for the legacy chunked byte-stream scheme: each `write()`
 * is its own complete gzip member, tagged with a member index in the chunk `version` field.
 * Slated to migrate to {@link COMPRESSION_DEFLATE_RAW}.
 *
 * @internal
 */
export const COMPRESSION_GZIP = 'gzip';

/**
 * Value of {@link COMPRESSION_ATTRIBUTE} for raw-deflate-compressed payloads.
 *
 * For inline (single-packet) payloads this is a one-shot raw-deflate buffer, base64'd into the
 * payload attribute. For chunked streams it is a single raw-deflate context shared across the whole
 * stream: the sender sync-flushes at every write boundary so the receiver can decompress each chunk
 * as it arrives, and terminates the deflate stream with a final block before the trailer. Receivers
 * concatenate chunk contents in `chunkIndex` order through one raw-deflate (windowBits -15)
 * decompressor.
 *
 * @internal
 */
export const COMPRESSION_DEFLATE_RAW = 'deflate-raw';
