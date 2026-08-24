/** one summarised stats entry; keys without a value are dropped */
type Summary = Record<string, unknown>;

function compact(summary: Summary): Summary {
  const compacted: Summary = {};
  for (const [key, value] of Object.entries(summary)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }
  return compacted;
}

function resolution(width?: number, height?: number): string | undefined {
  return width && height ? `${width}x${height}` : undefined;
}

/** the stats report holds seconds, logs read better in ms */
function ms(seconds?: number): number | undefined {
  return seconds === undefined ? undefined : Math.round(seconds * 1000);
}

/**
 * Average time media spent in the jitter buffer, in ms. Both counters are
 * cumulative, so this is the average over the lifetime of the stream.
 */
function jitterBufferMs(stat: Summary): number | undefined {
  const delay = stat.jitterBufferDelay as number | undefined;
  const emitted = stat.jitterBufferEmittedCount as number | undefined;
  return delay !== undefined && emitted ? Math.round((delay / emitted) * 1000) : undefined;
}

/**
 * Picks the interesting fields out of a `getStats()` report and groups them by
 * RTP stream, so a stats dump can be read without unfolding the raw report.
 * Values are logged as reported — the only maths here is unit conversion and
 * the jitter buffer average.
 */
export function summarizeStatsReport(report: RTCStatsReport): Summary {
  const byId = new Map<string, Summary>();
  const candidatePairs: Summary[] = [];
  const inbound: Summary[] = [];
  const outbound: Summary[] = [];
  let transport: Summary | undefined;

  report.forEach((stat) => byId.set(stat.id, stat));

  const codecOf = (stat: Summary) =>
    stat.codecId ? byId.get(stat.codecId as string)?.mimeType : undefined;
  const relatedOf = (stat: Summary, key: 'remoteId' | 'mediaSourceId') =>
    stat[key] ? byId.get(stat[key] as string) : undefined;

  report.forEach((stat) => {
    switch (stat.type) {
      case 'inbound-rtp':
        inbound.push(
          compact({
            kind: stat.kind,
            ssrc: stat.ssrc,
            mid: stat.mid,
            // matches `streamTrackID` in the track's own log context
            trackId: stat.trackIdentifier,
            codec: codecOf(stat),
            decoder: stat.decoderImplementation,
            resolution: resolution(stat.frameWidth, stat.frameHeight),
            fps: stat.framesPerSecond,
            bytesReceived: stat.bytesReceived,
            packetsReceived: stat.packetsReceived,
            packetsLost: stat.packetsLost,
            packetsDiscarded: stat.packetsDiscarded,
            // frames received without frames decoded is a decode failure
            framesReceived: stat.framesReceived,
            framesDecoded: stat.framesDecoded,
            framesDropped: stat.framesDropped,
            keyFramesDecoded: stat.keyFramesDecoded,
            freezeCount: stat.freezeCount,
            freezeMs: ms(stat.totalFreezesDuration),
            pauseCount: stat.pauseCount,
            nackCount: stat.nackCount,
            pliCount: stat.pliCount,
            firCount: stat.firCount,
            jitterMs: ms(stat.jitter),
            jitterBufferMs: jitterBufferMs(stat),
            audioLevel: stat.audioLevel,
            totalSamplesReceived: stat.totalSamplesReceived,
            concealedSamples: stat.concealedSamples,
          }),
        );
        break;
      case 'outbound-rtp': {
        const remote = relatedOf(stat, 'remoteId');
        const source = relatedOf(stat, 'mediaSourceId');
        outbound.push(
          compact({
            kind: stat.kind,
            ssrc: stat.ssrc,
            mid: stat.mid,
            rid: stat.rid,
            trackId: source?.trackIdentifier,
            active: stat.active,
            codec: codecOf(stat),
            encoder: stat.encoderImplementation,
            resolution: resolution(stat.frameWidth, stat.frameHeight),
            fps: stat.framesPerSecond,
            // what the source produces, to tell a stalled capture from a stalled encoder
            captureResolution: resolution(
              source?.width as number | undefined,
              source?.height as number | undefined,
            ),
            captureFps: source?.framesPerSecond,
            audioLevel: source?.audioLevel,
            targetBitrate: stat.targetBitrate,
            bytesSent: stat.bytesSent,
            packetsSent: stat.packetsSent,
            retransmittedPacketsSent: stat.retransmittedPacketsSent,
            framesEncoded: stat.framesEncoded,
            keyFramesEncoded: stat.keyFramesEncoded,
            limitedBy:
              stat.qualityLimitationReason === 'none' ? undefined : stat.qualityLimitationReason,
            nackCount: stat.nackCount,
            pliCount: stat.pliCount,
            firCount: stat.firCount,
            // loss, jitter and RTT are only known from what the remote reports
            remotePacketsLost: remote?.packetsLost,
            remoteFractionLost: remote?.fractionLost,
            remoteJitterMs: ms(remote?.jitter as number | undefined),
            remoteRttMs: ms(remote?.roundTripTime as number | undefined),
          }),
        );
        break;
      }
      case 'transport':
        transport = stat;
        break;
      case 'candidate-pair':
        candidatePairs.push(stat);
        break;
      default:
    }
  });

  const selectedPairId = transport?.selectedCandidatePairId as string | undefined;
  const pair =
    (selectedPairId ? byId.get(selectedPairId) : undefined) ??
    candidatePairs.find((candidate) => candidate.selected) ??
    candidatePairs.find((candidate) => candidate.nominated);
  const local = pair?.localCandidateId ? byId.get(pair.localCandidateId as string) : undefined;
  const remote = pair?.remoteCandidateId ? byId.get(pair.remoteCandidateId as string) : undefined;

  const connection = compact({
    ice: transport?.iceState,
    dtls: transport?.dtlsState,
    route:
      local && remote
        ? `${local.candidateType}/${local.protocol} -> ${remote.candidateType}`
        : undefined,
    network: local?.networkType,
    rttMs: ms(pair?.currentRoundTripTime as number | undefined),
    // the send bandwidth estimate; no RTP stream reports it
    availableOutgoingBitrate: pair?.availableOutgoingBitrate,
    availableIncomingBitrate: pair?.availableIncomingBitrate,
    bytesSent: pair?.bytesSent,
    bytesReceived: pair?.bytesReceived,
    candidatePairChanges: transport?.selectedCandidatePairChanges,
  });

  return compact({
    connection: Object.keys(connection).length > 0 ? connection : undefined,
    outbound: outbound.length > 0 ? outbound : undefined,
    inbound: inbound.length > 0 ? inbound : undefined,
  });
}
