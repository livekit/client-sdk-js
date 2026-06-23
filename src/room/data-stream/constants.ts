/**
 * Maximum size of a single data-stream chunk in bytes, and the budget used to decide whether a
 * payload can be sent inline as a single header packet. Kept below the ~16k data-channel MTU to
 * leave headroom for protocol framing and E2EE overhead.
 *
 * @internal
 */
export const STREAM_CHUNK_SIZE_BYTES = 15_000;
