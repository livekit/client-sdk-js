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

  /** ID of the outbound stream */
  streamId?: string;

  timestamp: number;
}

export interface AudioSenderStats extends SenderStats {
  type: 'audio';
}

export interface VideoSenderStats extends SenderStats {
  type: 'video';

  firCount: number;

  pliCount: number;

  nackCount: number;

  rid: string;

  frameWidth: number;

  frameHeight: number;

  framesSent: number;

  // bandwidth, cpu, other, none
  qualityLimitationReason: string;

  qualityLimitationResolutionChanges: number;

  retransmittedPacketsSent: number;
}

interface ReceiverStats {
  jitterBufferDelay?: number;

  /** packets reported lost by remote */
  packetsLost?: number;

  /** number of packets sent */
  packetsReceived?: number;

  bytesReceived?: number;

  streamId?: string;

  jitter?: number;

  timestamp: number;
}

export interface AudioReceiverStats extends ReceiverStats {
  type: 'audio';

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

  frameWidth?: number;

  frameHeight?: number;

  firCount?: number;

  pliCount?: number;

  nackCount?: number;
}

export function computeBitrate(
  bytesNow?: number, bytesPrev?: number,
  timeNow?: number, timePrev?: number,
): number {
  if (bytesNow === undefined || bytesPrev === undefined || timeNow === undefined
    || timePrev === undefined) {
    return 0;
  }
  return ((bytesNow - bytesPrev) * 8 * 1000) / (timeNow - timePrev);
}
