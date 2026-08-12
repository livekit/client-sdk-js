import { version as v } from '../package.json';

export const version = v;
export const protocolVersion = 17;

/** Initial client protocol. */
export const CLIENT_PROTOCOL_DEFAULT = 0;
/** Replaces RPC v1 protocol with a v2 data streams based one to support unlimited request /
 * response payload length. */
export const CLIENT_PROTOCOL_DATA_STREAM_RPC = 1;
/** "Data streams v2": the client knows how to receive a single-packet data stream (a stream whose
 * entire payload is smuggled into the header packet, with no chunk/trailer packets). Senders only
 * use the single-packet optimization when the recipient advertises at least this protocol. */
export const CLIENT_PROTOCOL_DATA_STREAM_V2 = 2;

/** The client protocol version indicates what level of support that the client has for
 * client <-> client api interactions. */
export const clientProtocol = CLIENT_PROTOCOL_DATA_STREAM_V2;
