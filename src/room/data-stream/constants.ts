/**
 * Maximum size of a single data-stream chunk in bytes, and the budget used to decide whether a
 * payload can be sent inline as a single header packet. Kept below the ~16k data-channel MTU to
 * leave headroom for protocol framing and E2EE overhead.
 *
 * @internal
 */
export const STREAM_CHUNK_SIZE_BYTES = 15_000;

/**
 * Default cap on the number of decompressed bytes a single incoming compressed data stream may
 * produce (5 GB). A tiny compressed payload can inflate to an arbitrarily large output
 * (decompression bomb), so the decompressor's output is bounded rather than trusting the wire
 * size; streams exceeding the cap error with `PayloadTooLarge`.
 *
 * @internal
 */
export const DEFAULT_MAX_PAYLOAD_BYTE_LENGTH = 5_000_000_000;

/**
 * Maximum number of incoming data streams a single remote participant may have open at once.
 * Each open stream holds receiver-side state until its trailer arrives (or the sender
 * disconnects), so without a cap a participant could open streams it never closes and exhaust
 * the receiver's memory. Headers for new streams beyond the cap are dropped.
 *
 * @internal
 */
export const MAX_OPEN_STREAMS_PER_PARTICIPANT = 500;
