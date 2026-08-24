export const monitorFrequency = 2000;

// key stats for senders and receivers
interface SenderStats {
  /** number of packets sent */
  packetsSent?: number;

  /** number of bytes sent */
  bytesSent?: number;

  /** jitter as perceived by remote */
  jitter?: number;

  /** packets reported lost by remote */
  packetsLost?: number;

  /** RTT reported by remote */
  roundTripTime?: number;

  /** fraction of packets the remote reported lost, 0-1 */
  fractionLost?: number;

  /** cumulative time packets spent queued before being sent, in seconds */
  totalPacketSendDelay?: number;

  /** ID of the outbound stream */
  streamId?: string;

  timestamp: number;
}

export interface AudioSenderStats extends SenderStats {
  type: 'audio';

  /** audio level of the capture source, 0-1 */
  audioLevel?: number;

  /** cumulative audio energy of the capture source; stays flat on a dead mic */
  totalAudioEnergy?: number;

  /** cumulative duration of all samples the capture source produced, in seconds */
  totalSamplesDuration?: number;
}

export interface VideoSenderStats extends SenderStats {
  type: 'video';

  firCount: number;

  pliCount: number;

  nackCount: number;

  rid: string;

  frameWidth: number;

  frameHeight: number;

  framesPerSecond: number;

  framesSent: number;

  // bandwidth, cpu, other, none
  qualityLimitationReason?: string;

  qualityLimitationDurations?: Record<string, number>;

  qualityLimitationResolutionChanges?: number;

  retransmittedPacketsSent?: number;

  targetBitrate: number;

  framesEncoded?: number;

  keyFramesEncoded?: number;

  /** cumulative encode time of all encoded frames, in seconds */
  totalEncodeTime?: number;

  /** sum of the QP of all encoded frames; over `framesEncoded` gives the average QP */
  qpSum?: number;

  /** frames that took significantly longer to encode than the target frame duration */
  hugeFramesSent?: number;

  encoderImplementation?: string;

  /** whether the encoder currently in use is hardware accelerated */
  powerEfficientEncoder?: boolean;

  scalabilityMode?: string;

  /** whether this layer is currently being encoded */
  active?: boolean;

  /** frames per second the capture source is producing, before encoding */
  captureFramesPerSecond?: number;

  captureWidth?: number;

  captureHeight?: number;
}

interface ReceiverStats {
  jitterBufferDelay?: number;

  /** number of samples/frames emitted from the jitter buffer, to average `jitterBufferDelay` over */
  jitterBufferEmittedCount?: number;

  /** delay the jitter buffer is currently aiming for, in seconds */
  jitterBufferTargetDelay?: number;

  /** lowest delay the jitter buffer could achieve for the current stream, in seconds */
  jitterBufferMinimumDelay?: number;

  retransmittedPacketsReceived?: number;

  fecPacketsReceived?: number;

  fecPacketsDiscarded?: number;

  /** packets reported lost by remote */
  packetsLost?: number;

  /** number of packets sent */
  packetsReceived?: number;

  /** packets discarded before decoding, e.g. because they arrived too late */
  packetsDiscarded?: number;

  bytesReceived?: number;

  streamId?: string;

  jitter?: number;

  timestamp: number;
}

export interface AudioReceiverStats extends ReceiverStats {
  type: 'audio';

  nackCount?: number;

  /** samples inserted to stretch playout, i.e. the jitter buffer running dry */
  insertedSamplesForDeceleration?: number;

  /** samples dropped to compress playout, i.e. the jitter buffer overfilling */
  removedSamplesForAcceleration?: number;

  totalSamplesReceived?: number;

  /** audio level of the received stream, 0-1 */
  audioLevel?: number;

  concealedSamples?: number;

  concealmentEvents?: number;

  silentConcealedSamples?: number;

  silentConcealmentEvents?: number;

  totalAudioEnergy?: number;

  totalSamplesDuration?: number;
}

export interface VideoReceiverStats extends ReceiverStats {
  type: 'video';

  framesDecoded: number;

  framesDropped: number;

  framesReceived: number;

  /** frames handed to the renderer per second */
  framesPerSecond?: number;

  /** key frames decoded so far; stays at 0 when the decoder never got a usable key frame */
  keyFramesDecoded?: number;

  /** number of times playback froze (a frame took much longer than expected) */
  freezeCount?: number;

  /** cumulative duration of all freezes, in seconds */
  totalFreezesDuration?: number;

  /** number of times playback was paused by the browser */
  pauseCount?: number;

  /** cumulative duration of all pauses, in seconds */
  totalPausesDuration?: number;

  /** cumulative decode time of all decoded frames, in seconds */
  totalDecodeTime?: number;

  /** cumulative delay between consecutive rendered frames, in seconds */
  totalInterFrameDelay?: number;

  /** sum of the squared inter-frame delays, to derive how uneven rendering was */
  totalSquaredInterFrameDelay?: number;

  framesAssembledFromMultiplePackets?: number;

  /** cumulative time spent assembling frames from multiple packets, in seconds */
  totalAssemblyTime?: number;

  /** sum of the QP of all decoded frames; over `framesDecoded` gives the average QP */
  qpSum?: number;

  frameWidth?: number;

  frameHeight?: number;

  firCount?: number;

  pliCount?: number;

  nackCount?: number;

  decoderImplementation?: string;

  /** whether the decoder currently in use is hardware accelerated */
  powerEfficientDecoder?: boolean;

  mimeType?: string;
}

export function computeBitrate<T extends ReceiverStats | SenderStats>(
  currentStats: T,
  prevStats?: T,
): number {
  if (!prevStats) {
    return 0;
  }
  let bytesNow: number | undefined;
  let bytesPrev: number | undefined;
  if ('bytesReceived' in currentStats) {
    bytesNow = (currentStats as ReceiverStats).bytesReceived;
    bytesPrev = (prevStats as ReceiverStats).bytesReceived;
  } else if ('bytesSent' in currentStats) {
    bytesNow = (currentStats as SenderStats).bytesSent;
    bytesPrev = (prevStats as SenderStats).bytesSent;
  }
  if (
    bytesNow === undefined ||
    bytesPrev === undefined ||
    currentStats.timestamp === undefined ||
    prevStats.timestamp === undefined
  ) {
    return 0;
  }
  return ((bytesNow - bytesPrev) * 8 * 1000) / (currentStats.timestamp - prevStats.timestamp);
}
