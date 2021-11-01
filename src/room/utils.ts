import { ConnectionStatus } from './stats';

const separator = '|';

export function unpackStreamId(packed: string): string[] {
  const parts = packed.split(separator);
  if (parts.length > 1) {
    return [parts[0], packed.substr(parts[0].length + 1)];
  }
  return [packed, ''];
}

export function useLegacyAPI(): boolean {
  // react native is using old stream based API
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

export async function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export async function getConnectionStatus(currentData: any, previousData: any) {
  const result: ConnectionStatus = {
    audio: {
      outbound: 0,
      inbound: 0,
      jitter: 0,
      packetsLost: 0,
    },
    video: {
      outbound: 0,
      inbound: 0,
      jitter: 0,
      packetsLost: 0,
    },
  };

  const { kind, type } = currentData;
  delete currentData.kind;
  delete currentData.type;
  delete currentData.hasData;

  if (kind === 'audio' && type === 'outbound-rtp') {
    const audioStat = await calculateBitsPerSecondFromMultipleData(currentData, previousData);
    result.audio.outbound = audioStat.outbound;
  } else if (kind === 'audio' && type === 'inbound-rtp') {
    const audioStat = await calculateBitsPerSecondFromMultipleData(currentData, previousData);
    result.audio.inbound = audioStat.inbound;
    result.audio.jitter = audioStat.jitter;
    result.audio.packetsLost = audioStat.packetsLost;
  } else if (kind === 'video' && type === 'outbound-rtp') {
    const videoStat = await calculateBitsPerSecondFromMultipleData(currentData, previousData);
    result.video.outbound = videoStat.outbound;
  } else if (kind === 'video' && type === 'inbound-rtp') {
    const videoStat = await calculateBitsPerSecondFromMultipleData(currentData, previousData);
    result.video.inbound = videoStat.inbound;
    result.video.jitter = videoStat.jitter;
    result.video.packetsLost = videoStat.packetsLost;
  }

  return result;
}

export async function calculateBitsPerSecondFromMultipleData(currentData: any, previousData: any) {
  const result = {
    inbound: 0,
    outbound: 0,
    jitter: 0,
    packetsLost: 0,
  };

  if (!previousData && currentData) {
    previousData = currentData;
    return result;
  }

  if (!currentData || !previousData) return result;

  Object.keys(currentData).forEach((peerId) => {
    if (previousData[peerId] && (currentData[peerId].type === 'outbound-rtp' || currentData[peerId].type === 'inbound-rtp')) {
      const {
        outbound: peerOutbound,
        inbound: peerInbound,

      } = calculateBitsPerSecond(currentData[peerId], previousData[peerId]);

      result.outbound += peerOutbound;
      result.inbound += peerInbound;
    }

    if (currentData[peerId].type === 'inbound-rtp') {
      result.jitter = currentData[peerId].jitter;
      result.packetsLost = currentData[peerId].packetsLost;
    }
  });
  return result;
}

export function calculateBitsPerSecond(currentData: any, previousData: any) {
  const result = {
    inbound: 0,
    outbound: 0,
  };

  if (!currentData || !previousData) return result;

  const currentOutboundData = currentData.type === 'outbound-rtp' ? currentData : null;
  const previousOutboundData = previousData.type === 'outbound-rtp' ? previousData : null;

  const currentInboundData = currentData.type === 'inbound-rtp' ? currentData : null;
  const previousInboundData = previousData.type === 'inbound-rtp' ? previousData : null;

  if (currentOutboundData && previousOutboundData) {
    const {
      bytesSent: outboundBytesSent,
      timestamp: outboundTimestamp,
    } = currentOutboundData;

    let {
      headerBytesSent: outboundHeaderBytesSent,
    } = currentOutboundData;

    if (!outboundHeaderBytesSent) outboundHeaderBytesSent = 0;

    const {
      bytesSent: previousOutboundBytesSent,
      timestamp: previousOutboundTimestamp,
    } = previousOutboundData;

    let {
      headerBytesSent: previousOutboundHeaderBytesSent,
    } = previousOutboundData;

    if (!previousOutboundHeaderBytesSent) previousOutboundHeaderBytesSent = 0;

    const outboundBytesPerSecond = (outboundBytesSent + outboundHeaderBytesSent
      - previousOutboundBytesSent - previousOutboundHeaderBytesSent)
      / (outboundTimestamp - previousOutboundTimestamp);

    result.outbound = Math.round((outboundBytesPerSecond * 8 * 1000) / 1024);
  }

  if (currentInboundData && previousInboundData) {
    const {
      bytesReceived: inboundBytesReceived,
      timestamp: inboundTimestamp,
    } = currentInboundData;

    let {
      headerBytesReceived: inboundHeaderBytesReceived,
    } = currentInboundData;

    if (!inboundHeaderBytesReceived) inboundHeaderBytesReceived = 0;

    const {
      bytesReceived: previousInboundBytesReceived,
      timestamp: previousInboundTimestamp,
    } = previousInboundData;

    let {
      headerBytesReceived: previousInboundHeaderBytesReceived,
    } = previousInboundData;

    if (!previousInboundHeaderBytesReceived) {
      previousInboundHeaderBytesReceived = 0;
    }

    const inboundBytesPerSecond = (inboundBytesReceived
      + inboundHeaderBytesReceived - previousInboundBytesReceived
      - previousInboundHeaderBytesReceived) / (inboundTimestamp
        - previousInboundTimestamp);

    result.inbound = Math.round((inboundBytesPerSecond * 8 * 1000) / 1024);
  }

  return result;
}
