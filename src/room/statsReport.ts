import type {
  AudioReceiverStats,
  AudioSenderStats,
  VideoReceiverStats,
  VideoSenderStats,
} from './stats';
import { computeBitrate } from './stats';

/** how often the room dumps the stats of all of its tracks to the log */
export const STATS_LOG_FREQUENCY = 30_000;

export type StatsReport = Record<string, unknown>;

/** the part of a report window the base `Track` drives, whatever its stats type */
export interface TrackStatsWindow {
  /** report covering everything accumulated since the previous take */
  take(): StatsReport | undefined;

  /** report covering the whole lifetime of the track */
  end(): StatsReport | undefined;
}

/**
 * Collects the stats snapshots a track's monitor loop produces, so reports can
 * express counters as deltas over a window instead of as raw cumulative values.
 *
 * The window is closed by whoever pulls the report, not by a timer in here, so
 * every track in one dump covers the same stretch of the session.
 */
export class StatsReportWindow<T> implements TrackStatsWindow {
  private summarize: (current: T, baseline: T) => StatsReport;

  private first?: T;

  private latest?: T;

  private baseline?: T;

  private ended = false;

  constructor(summarize: (current: T, baseline: T) => StatsReport) {
    this.summarize = summarize;
  }

  /** records a snapshot from the monitor loop */
  record(stats: T) {
    if (this.first === undefined) {
      this.first = stats;
    }
    if (this.baseline === undefined) {
      this.baseline = stats;
    }
    this.latest = stats;
  }

  /**
   * Returns the report for everything recorded since the previous take and
   * rebases the window, or `undefined` when no new snapshot came in.
   */
  take(): StatsReport | undefined {
    if (this.baseline === undefined || this.latest === undefined || this.baseline === this.latest) {
      return undefined;
    }
    const report = this.summarize(this.latest, this.baseline);
    this.baseline = this.latest;
    return report;
  }

  /**
   * Returns the report covering the whole lifetime of the track. Only ever
   * returns once, and only when the monitor loop sampled more than once, so
   * tracks that ended right away stay silent.
   */
  end(): StatsReport | undefined {
    if (this.ended || this.first === undefined || this.latest === undefined) {
      return undefined;
    }
    if (this.first === this.latest) {
      return undefined;
    }
    this.ended = true;
    return this.summarize(this.latest, this.first);
  }
}

/** counter delta over the reporting window */
function delta(current?: number, previous?: number): number | undefined {
  if (current === undefined) {
    return undefined;
  }
  return previous === undefined ? current : current - previous;
}

/** delta of one of the cumulative duration counters, converted from seconds to ms */
function durationDeltaMs(current?: number, previous?: number): number | undefined {
  const seconds = delta(current, previous);
  return seconds === undefined ? undefined : Math.round(seconds * 1000);
}

function round(value: number | undefined, digits = 2): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Per-unit average of two cumulative counters over the window: the ratio of
 * their deltas is the average for the window rather than for the lifetime of
 * the track. `scale` converts the numerator's unit (1000 for seconds to ms).
 */
function avgOverWindow(
  total: number | undefined,
  totalBaseline: number | undefined,
  count: number | undefined,
  countBaseline: number | undefined,
  scale = 1,
): number | undefined {
  const totalDelta = delta(total, totalBaseline);
  const countDelta = delta(count, countBaseline);
  if (totalDelta === undefined || !countDelta) {
    return undefined;
  }
  return round((totalDelta / countDelta) * scale);
}

interface JitterBufferStats {
  jitterBufferDelay?: number;
  jitterBufferTargetDelay?: number;
  jitterBufferMinimumDelay?: number;
  jitterBufferEmittedCount?: number;
}

/**
 * What the jitter buffer did over the window: how long media actually waited
 * in it, what it was aiming for, and the floor it could have achieved. All
 * three are cumulative over the emitted samples/frames.
 */
function jitterBufferReport(current: JitterBufferStats, baseline: JitterBufferStats): StatsReport {
  const emitted = (stats: JitterBufferStats) => stats.jitterBufferEmittedCount;
  return {
    avgJitterBufferDelayMs: avgOverWindow(
      current.jitterBufferDelay,
      baseline.jitterBufferDelay,
      emitted(current),
      emitted(baseline),
      1000,
    ),
    avgJitterBufferTargetDelayMs: avgOverWindow(
      current.jitterBufferTargetDelay,
      baseline.jitterBufferTargetDelay,
      emitted(current),
      emitted(baseline),
      1000,
    ),
    avgJitterBufferMinimumDelayMs: avgOverWindow(
      current.jitterBufferMinimumDelay,
      baseline.jitterBufferMinimumDelay,
      emitted(current),
      emitted(baseline),
      1000,
    ),
    jitterBufferEmittedCount: delta(
      current.jitterBufferEmittedCount,
      baseline.jitterBufferEmittedCount,
    ),
  };
}

/**
 * How uneven rendering was over the window: the standard deviation of the
 * inter-frame delay, derived from the cumulative sum and sum of squares the way
 * webrtc-internals does it. A high value next to a healthy average is stutter.
 */
function interFrameDelayStdDevMs(
  current: VideoReceiverStats,
  baseline: VideoReceiverStats,
): number | undefined {
  const sum = delta(current.totalInterFrameDelay, baseline.totalInterFrameDelay);
  const squared = delta(current.totalSquaredInterFrameDelay, baseline.totalSquaredInterFrameDelay);
  const frames = delta(current.framesDecoded, baseline.framesDecoded);
  if (sum === undefined || squared === undefined || !frames) {
    return undefined;
  }
  const variance = squared / frames - (sum / frames) ** 2;
  return variance > 0 ? round(Math.sqrt(variance) * 1000) : 0;
}

/** bits per second a byte counter's delta corresponds to */
function bitrate(bytes: number | undefined, elapsedMs: number): number | undefined {
  if (bytes === undefined || elapsedMs <= 0) {
    return undefined;
  }
  return Math.round((bytes * 8 * 1000) / elapsedMs);
}

/**
 * Drops keys without a value so reports stay small and browsers that don't
 * implement a given stat don't fill the log with `undefined`.
 */
function compact(report: StatsReport): StatsReport {
  const compacted: StatsReport = {};
  for (const [key, value] of Object.entries(report)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }
  return compacted;
}

export function summarizeVideoReceiverStats(
  current: VideoReceiverStats,
  baseline: VideoReceiverStats,
): StatsReport {
  const elapsedMs = Math.round(current.timestamp - baseline.timestamp);
  const framesDecoded = delta(current.framesDecoded, baseline.framesDecoded);
  return compact({
    elapsedMs,
    bitrate: Math.round(computeBitrate(current, baseline)),
    // frames received but not decoded is the signature of a decode failure
    framesReceived: delta(current.framesReceived, baseline.framesReceived),
    framesDecoded,
    framesDropped: delta(current.framesDropped, baseline.framesDropped),
    keyFramesDecoded: delta(current.keyFramesDecoded, baseline.keyFramesDecoded),
    decodedFps: elapsedMs > 0 ? round(((framesDecoded ?? 0) * 1000) / elapsedMs) : undefined,
    packetsReceived: delta(current.packetsReceived, baseline.packetsReceived),
    packetsLost: delta(current.packetsLost, baseline.packetsLost),
    packetsDiscarded: delta(current.packetsDiscarded, baseline.packetsDiscarded),
    nackCount: delta(current.nackCount, baseline.nackCount),
    pliCount: delta(current.pliCount, baseline.pliCount),
    firCount: delta(current.firCount, baseline.firCount),
    freezeCount: delta(current.freezeCount, baseline.freezeCount),
    freezeDurationMs: durationDeltaMs(current.totalFreezesDuration, baseline.totalFreezesDuration),
    pauseCount: delta(current.pauseCount, baseline.pauseCount),
    pauseDurationMs: durationDeltaMs(current.totalPausesDuration, baseline.totalPausesDuration),
    retransmittedPacketsReceived: delta(
      current.retransmittedPacketsReceived,
      baseline.retransmittedPacketsReceived,
    ),
    fecPacketsReceived: delta(current.fecPacketsReceived, baseline.fecPacketsReceived),
    fecPacketsDiscarded: delta(current.fecPacketsDiscarded, baseline.fecPacketsDiscarded),
    // per decoded frame, so a decoder falling behind shows up regardless of fps
    avgDecodeTimeMs: avgOverWindow(
      current.totalDecodeTime,
      baseline.totalDecodeTime,
      current.framesDecoded,
      baseline.framesDecoded,
      1000,
    ),
    avgInterFrameDelayMs: avgOverWindow(
      current.totalInterFrameDelay,
      baseline.totalInterFrameDelay,
      current.framesDecoded,
      baseline.framesDecoded,
      1000,
    ),
    interFrameDelayStdDevMs: interFrameDelayStdDevMs(current, baseline),
    framesAssembledFromMultiplePackets: delta(
      current.framesAssembledFromMultiplePackets,
      baseline.framesAssembledFromMultiplePackets,
    ),
    avgAssemblyTimeMs: avgOverWindow(
      current.totalAssemblyTime,
      baseline.totalAssemblyTime,
      current.framesAssembledFromMultiplePackets,
      baseline.framesAssembledFromMultiplePackets,
      1000,
    ),
    avgQp: avgOverWindow(
      current.qpSum,
      baseline.qpSum,
      current.framesDecoded,
      baseline.framesDecoded,
    ),
    frameWidth: current.frameWidth,
    frameHeight: current.frameHeight,
    framesPerSecond: current.framesPerSecond,
    jitter: round(current.jitter, 4),
    ...jitterBufferReport(current, baseline),
    decoderImplementation: current.decoderImplementation,
    powerEfficientDecoder: current.powerEfficientDecoder,
    mimeType: current.mimeType,
  });
}

export function summarizeAudioReceiverStats(
  current: AudioReceiverStats,
  baseline: AudioReceiverStats,
): StatsReport {
  return compact({
    elapsedMs: Math.round(current.timestamp - baseline.timestamp),
    bitrate: Math.round(computeBitrate(current, baseline)),
    packetsReceived: delta(current.packetsReceived, baseline.packetsReceived),
    packetsLost: delta(current.packetsLost, baseline.packetsLost),
    packetsDiscarded: delta(current.packetsDiscarded, baseline.packetsDiscarded),
    retransmittedPacketsReceived: delta(
      current.retransmittedPacketsReceived,
      baseline.retransmittedPacketsReceived,
    ),
    fecPacketsReceived: delta(current.fecPacketsReceived, baseline.fecPacketsReceived),
    fecPacketsDiscarded: delta(current.fecPacketsDiscarded, baseline.fecPacketsDiscarded),
    nackCount: delta(current.nackCount, baseline.nackCount),
    jitter: round(current.jitter, 4),
    ...jitterBufferReport(current, baseline),
    // NetEq stretching or compressing playout: the buffer ran dry or overfilled
    insertedSamplesForDeceleration: delta(
      current.insertedSamplesForDeceleration,
      baseline.insertedSamplesForDeceleration,
    ),
    removedSamplesForAcceleration: delta(
      current.removedSamplesForAcceleration,
      baseline.removedSamplesForAcceleration,
    ),
    totalSamplesReceived: delta(current.totalSamplesReceived, baseline.totalSamplesReceived),
    concealedSamples: delta(current.concealedSamples, baseline.concealedSamples),
    concealmentEvents: delta(current.concealmentEvents, baseline.concealmentEvents),
    silentConcealedSamples: delta(current.silentConcealedSamples, baseline.silentConcealedSamples),
    audioLevel: round(current.audioLevel, 4),
    audioEnergy: round(delta(current.totalAudioEnergy, baseline.totalAudioEnergy), 4),
  });
}

export function summarizeAudioSenderStats(
  current: AudioSenderStats,
  baseline: AudioSenderStats,
): StatsReport {
  return compact({
    elapsedMs: Math.round(current.timestamp - baseline.timestamp),
    bitrate: Math.round(computeBitrate(current, baseline)),
    packetsSent: delta(current.packetsSent, baseline.packetsSent),
    packetsLost: delta(current.packetsLost, baseline.packetsLost),
    fractionLost: round(current.fractionLost, 4),
    jitter: round(current.jitter, 4),
    roundTripTimeMs:
      current.roundTripTime === undefined ? undefined : round(current.roundTripTime * 1000),
    avgPacketSendDelayMs: avgOverWindow(
      current.totalPacketSendDelay,
      baseline.totalPacketSendDelay,
      current.packetsSent,
      baseline.packetsSent,
      1000,
    ),
    // the capture source rather than the encoder: flat energy means a dead mic
    audioLevel: round(current.audioLevel, 4),
    audioEnergy: round(delta(current.totalAudioEnergy, baseline.totalAudioEnergy), 4),
    sampleDurationMs: durationDeltaMs(current.totalSamplesDuration, baseline.totalSamplesDuration),
  });
}

export type VideoSenderStatsByRid = Map<string, VideoSenderStats>;

/**
 * Aggregates the simulcast layers of a sender into one report, keeping a
 * per-layer breakdown so a single degraded layer stays visible.
 */
export function summarizeVideoSenderStats(
  current: VideoSenderStatsByRid,
  baseline: VideoSenderStatsByRid,
): StatsReport {
  let elapsedMs = 0;
  let totalBitrate = 0;
  let packetsSent = 0;
  let packetsLost = 0;
  let framesSent = 0;
  let roundTripTimeMs: number | undefined;
  let capture: StatsReport | undefined;
  const layers: StatsReport[] = [];

  current.forEach((stats, rid) => {
    const prev = baseline.get(rid);
    elapsedMs = Math.max(elapsedMs, prev ? Math.round(stats.timestamp - prev.timestamp) : 0);
    totalBitrate += computeBitrate(stats, prev);
    packetsSent += delta(stats.packetsSent, prev?.packetsSent) ?? 0;
    packetsLost += delta(stats.packetsLost, prev?.packetsLost) ?? 0;
    framesSent += delta(stats.framesSent, prev?.framesSent) ?? 0;
    if (stats.roundTripTime !== undefined) {
      roundTripTimeMs = Math.max(roundTripTimeMs ?? 0, Math.round(stats.roundTripTime * 1000));
    }
    // the capture source is shared by every layer, so it is reported once
    if (!capture && stats.captureFramesPerSecond !== undefined) {
      capture = compact({
        framesPerSecond: stats.captureFramesPerSecond,
        width: stats.captureWidth,
        height: stats.captureHeight,
      });
    }
    layers.push(
      compact({
        rid,
        active: stats.active,
        bitrate: Math.round(computeBitrate(stats, prev)),
        targetBitrate: stats.targetBitrate,
        framesSent: delta(stats.framesSent, prev?.framesSent),
        framesEncoded: delta(stats.framesEncoded, prev?.framesEncoded),
        keyFramesEncoded: delta(stats.keyFramesEncoded, prev?.keyFramesEncoded),
        hugeFramesSent: delta(stats.hugeFramesSent, prev?.hugeFramesSent),
        framesPerSecond: stats.framesPerSecond,
        frameWidth: stats.frameWidth,
        frameHeight: stats.frameHeight,
        avgEncodeTimeMs: avgOverWindow(
          stats.totalEncodeTime,
          prev?.totalEncodeTime,
          stats.framesEncoded,
          prev?.framesEncoded,
          1000,
        ),
        avgQp: avgOverWindow(stats.qpSum, prev?.qpSum, stats.framesEncoded, prev?.framesEncoded),
        avgPacketSendDelayMs: avgOverWindow(
          stats.totalPacketSendDelay,
          prev?.totalPacketSendDelay,
          stats.packetsSent,
          prev?.packetsSent,
          1000,
        ),
        qualityLimitationReason: stats.qualityLimitationReason,
        qualityLimitationDurationsMs: qualityLimitationDeltas(stats, prev),
        qualityLimitationResolutionChanges: delta(
          stats.qualityLimitationResolutionChanges,
          prev?.qualityLimitationResolutionChanges,
        ),
        packetsLost: delta(stats.packetsLost, prev?.packetsLost),
        fractionLost: round(stats.fractionLost, 4),
        jitter: round(stats.jitter, 4),
        retransmittedPacketsSent: delta(
          stats.retransmittedPacketsSent,
          prev?.retransmittedPacketsSent,
        ),
        nackCount: delta(stats.nackCount, prev?.nackCount),
        pliCount: delta(stats.pliCount, prev?.pliCount),
        firCount: delta(stats.firCount, prev?.firCount),
        encoderImplementation: stats.encoderImplementation,
        powerEfficientEncoder: stats.powerEfficientEncoder,
        scalabilityMode: stats.scalabilityMode,
      }),
    );
  });

  return compact({
    elapsedMs,
    bitrate: Math.round(totalBitrate),
    packetsSent,
    packetsLost,
    framesSent,
    roundTripTimeMs,
    capture,
    layers,
  });
}

/**
 * How many ms of the window each quality limitation was in effect for. The
 * durations are cumulative per reason, so only the ones that moved are kept.
 */
function qualityLimitationDeltas(
  current: VideoSenderStats,
  baseline?: VideoSenderStats,
): StatsReport | undefined {
  const durations = current.qualityLimitationDurations;
  if (!durations) {
    return undefined;
  }
  const report: StatsReport = {};
  for (const [reason, seconds] of Object.entries(durations)) {
    const elapsed = durationDeltaMs(seconds, baseline?.qualityLimitationDurations?.[reason]);
    if (elapsed) {
      report[reason] = elapsed;
    }
  }
  return Object.keys(report).length > 0 ? report : undefined;
}

/**
 * Transport level stats of one peer connection, taken from the selected ICE
 * candidate pair. These are per connection rather than per track, and carry the
 * things no RTP stream reports: what bandwidth the connection believes it has,
 * how it is routed, and whether it is still alive.
 */
export interface ConnectionStats {
  timestamp: number;

  bytesSent?: number;

  bytesReceived?: number;

  packetsSent?: number;

  packetsReceived?: number;

  /** send bandwidth estimate of the congestion controller, in bps */
  availableOutgoingBitrate?: number;

  /** receive bandwidth estimate, in bps; only reported by some browsers */
  availableIncomingBitrate?: number;

  currentRoundTripTime?: number;

  totalRoundTripTime?: number;

  responsesReceived?: number;

  requestsSent?: number;

  localCandidateType?: string;

  localCandidateProtocol?: string;

  localNetworkType?: string;

  remoteCandidateType?: string;

  dtlsState?: string;

  iceState?: string;

  selectedCandidatePairChanges?: number;
}

/**
 * Picks the selected candidate pair and the transport out of a peer
 * connection's stats report.
 */
export function extractConnectionStats(report: RTCStatsReport): ConnectionStats | undefined {
  let transport: any;
  const pairs = new Map<string, any>();
  const candidates = new Map<string, any>();

  report.forEach((stat) => {
    switch (stat.type) {
      case 'transport':
        transport = stat;
        break;
      case 'candidate-pair':
        pairs.set(stat.id, stat);
        break;
      case 'local-candidate':
      case 'remote-candidate':
        candidates.set(stat.id, stat);
        break;
      default:
    }
  });

  const all = Array.from(pairs.values());
  const pair =
    (transport?.selectedCandidatePairId
      ? pairs.get(transport.selectedCandidatePairId)
      : undefined) ??
    all.find((candidate) => candidate.selected) ??
    all.find((candidate) => candidate.nominated);

  const timestamp = pair?.timestamp ?? transport?.timestamp;
  if (timestamp === undefined) {
    return undefined;
  }

  const local = pair ? candidates.get(pair.localCandidateId) : undefined;
  const remote = pair ? candidates.get(pair.remoteCandidateId) : undefined;

  return {
    timestamp,
    bytesSent: pair?.bytesSent,
    bytesReceived: pair?.bytesReceived,
    packetsSent: pair?.packetsSent,
    packetsReceived: pair?.packetsReceived,
    availableOutgoingBitrate: pair?.availableOutgoingBitrate,
    availableIncomingBitrate: pair?.availableIncomingBitrate,
    currentRoundTripTime: pair?.currentRoundTripTime,
    totalRoundTripTime: pair?.totalRoundTripTime,
    responsesReceived: pair?.responsesReceived,
    requestsSent: pair?.requestsSent,
    localCandidateType: local?.candidateType,
    localCandidateProtocol: local?.protocol,
    localNetworkType: local?.networkType,
    remoteCandidateType: remote?.candidateType,
    dtlsState: transport?.dtlsState,
    iceState: transport?.iceState,
    selectedCandidatePairChanges: transport?.selectedCandidatePairChanges,
  };
}

export function summarizeConnectionStats(
  current: ConnectionStats,
  baseline?: ConnectionStats,
): StatsReport {
  const elapsedMs = baseline ? Math.round(current.timestamp - baseline.timestamp) : 0;
  return compact({
    elapsedMs: elapsedMs || undefined,
    // what the congestion controller thinks is available, next to what was
    // actually used: the gap is the headroom the publisher had
    availableOutgoingBitrate: current.availableOutgoingBitrate,
    availableIncomingBitrate: current.availableIncomingBitrate,
    sendBitrate: bitrate(delta(current.bytesSent, baseline?.bytesSent), elapsedMs),
    recvBitrate: bitrate(delta(current.bytesReceived, baseline?.bytesReceived), elapsedMs),
    packetsSent: delta(current.packetsSent, baseline?.packetsSent),
    packetsReceived: delta(current.packetsReceived, baseline?.packetsReceived),
    currentRoundTripTimeMs:
      current.currentRoundTripTime === undefined
        ? undefined
        : round(current.currentRoundTripTime * 1000),
    avgRoundTripTimeMs: baseline
      ? avgOverWindow(
          current.totalRoundTripTime,
          baseline.totalRoundTripTime,
          current.responsesReceived,
          baseline.responsesReceived,
          1000,
        )
      : undefined,
    candidatePair:
      current.localCandidateType && current.remoteCandidateType
        ? `${current.localCandidateType}/${current.localCandidateProtocol} -> ${current.remoteCandidateType}`
        : undefined,
    networkType: current.localNetworkType,
    dtlsState: current.dtlsState,
    iceState: current.iceState,
    selectedCandidatePairChanges: current.selectedCandidatePairChanges,
  });
}
