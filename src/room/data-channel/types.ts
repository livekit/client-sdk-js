import { DataPacket_Kind } from '@livekit/protocol';

export enum DataChannelKind {
  RELIABLE = DataPacket_Kind.RELIABLE,
  LOSSY = DataPacket_Kind.LOSSY,
  DATA_TRACK_LOSSY = 2,
}

// Two-watermark flow control for the reliable and data-track channels. Senders fill the buffer
// freely up to the high-water mark; once it's exceeded they block until the browser's
// `bufferedamountlow` event (which we arm at the low-water mark) signals the buffer has drained.
// The gap between the marks keeps the SCTP send buffer saturated while we refill, so throughput
// isn't starved, while the high-water mark bounds the buffer well below the level that would abort
// the channel (see livekit/client-sdk-js#1995).
export const reliableDataChannelWaterMarkLow = 64 * 1024;
export const reliableDataChannelWaterMarkHigh = 1024 * 1024;
export const lossyDataChannelWaterMarkLow = 8 * 1024;
export const lossyDataChannelWaterMarkHigh = 256 * 1024;

export function dataChannelLowWaterMark(kind: DataChannelKind): number {
  return kind === DataChannelKind.RELIABLE
    ? reliableDataChannelWaterMarkLow
    : lossyDataChannelWaterMarkLow;
}

export function dataChannelHighWaterMark(kind: DataChannelKind): number {
  return kind === DataChannelKind.RELIABLE
    ? reliableDataChannelWaterMarkHigh
    : lossyDataChannelWaterMarkHigh;
}
