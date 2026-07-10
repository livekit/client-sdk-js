import { version as v } from '../package.json';

export const version = v;
export const protocolVersion = 17;

/** Initial client protocol. */
export const CLIENT_PROTOCOL_DEFAULT = 0;
/** Replaces RPC v1 protocol with a v2 data streams based one to support unlimited request /
 * response payload length. */
export const CLIENT_PROTOCOL_DATA_STREAM_RPC = 1;

/** The client protocol version indicates what level of support that the client has for
 * client <-> client api interactions. */
export const clientProtocol = CLIENT_PROTOCOL_DATA_STREAM_RPC;
