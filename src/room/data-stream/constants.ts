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
 * iff it is present. Both inline and chunked text and byte streams use {@link COMPRESSION_DEFLATE_RAW}.
 *
 * @internal
 */
export const COMPRESSION_ATTRIBUTE = 'lk.compression';

/**
 * Value of {@link COMPRESSION_ATTRIBUTE} for raw-deflate-compressed payloads.
 *
 * For inline (single-packet) payloads this is a one-shot raw-deflate buffer, base64'd into the
 * payload attribute. For chunked streams it is a single raw-deflate context spanning the whole
 * stream, terminated by a final block before the trailer; receivers concatenate chunk contents in
 * `chunkIndex` order through one raw-deflate (windowBits -15) decompressor. The format also
 * supports sync-flushing at write boundaries (context takeover) so a future incremental sender
 * could compress without a protocol change, though current senders (`sendText`/`sendFile`)
 * compress the full payload in one shot.
 *
 * @internal
 */
export const COMPRESSION_DEFLATE_RAW = 'deflate-raw';
