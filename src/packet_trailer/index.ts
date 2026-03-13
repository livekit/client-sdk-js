export {
  type UserFrameMetadata,
  type PacketTrailerInfo,
  type PacketTrailerWithRtp,
  TAG_FRAME_ID,
  TAG_TIMESTAMP_US,
  PACKET_TRAILER_ENVELOPE_SIZE,
  PACKET_TRAILER_MAGIC,
  PACKET_TRAILER_SIZE,
  extractPacketTrailer,
  stripPacketTrailerFromEncodedFrame,
} from './PacketTrailerTransformer';
