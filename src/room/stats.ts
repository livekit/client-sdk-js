export const monitorFrequency = 2000;

// key stats for senders and receivers
interface SenderStats {
  /** number of packets sent */
  packetsSent?: number;

  /** jitter as perceived by remote */
  jitter?: number;

  /** packets reported lost by remote */
  packetsLost?: number;

  /** RTT reported by remote */
  roundTripTime?: number;

  /** ID of the outbound stream */
  streamId?: string;
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

  timestamp: number;
}

interface ReceiverStats {
  jitterBufferDelay?: number;

  /** packets reported lost by remote */
  packetsLost?: number;

  /** number of packets sent */
  packetsReceived?: number;

  streamId?: string;
}

export interface VideoReceiverStats extends ReceiverStats {
  type: 'video';

  framesDecoded: number;

  framesDropped: number;

  framesReceived: number;

  frameWidth: number;

  frameHeight: number;

  firCount: number;

  pliCount: number;

  nackCount: number;
}

export interface ConnectionStatus {
  'audio': {

    outbound: number,

    inbound: number,

    jitter: number,

    packetsLost: number,
  },
  'video': {

    outbound: number,

    inbound: number,

    jitter: number,

    packetsLost: number,
  }
}
