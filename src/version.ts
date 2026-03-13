import { version as v } from '../package.json';

export const version = v;
export const protocolVersion = 16;

export const CLIENT_PROTOCOL_DEFAULT = 0;
export const CLIENT_PROTOCOL_GZIP_RPC = 1;

/** The client protocol version indicates what level of support that the client has for
 * client <-> client api interactions. */
export const clientProtocol = CLIENT_PROTOCOL_GZIP_RPC;
