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
 * iff it is present. The only supported value today is {@link COMPRESSION_GZIP}.
 *
 * @internal
 */
export const COMPRESSION_ATTRIBUTE = 'lk.compression';

/** Value of {@link COMPRESSION_ATTRIBUTE} for gzip-compressed payloads. @internal */
export const COMPRESSION_GZIP = 'gzip';
