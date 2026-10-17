/**
 * One `getStats()` report → one reading per track in SPEC keys and units (ms), and the window that
 * folds readings into one `lk.rtc.stats.sample`: counters as the last reading, gauges as min/max/avg.
 */
import type { Attributes } from './otlp';

export interface TrackRef {
  sid: string;
  kind: 'audio' | 'video';
  direction: 'inbound' | 'outbound';
}

export interface Sample {
  codec?: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
}

type Stat = Record<string, any>;

/** Gauges keep their precision; durations are integer counters. */
const ms = (seconds: number | undefined) => (seconds === undefined ? undefined : seconds * 1000);
const msInt = (seconds: number | undefined) =>
  seconds === undefined ? undefined : Math.round(seconds * 1000);

/** One track's layers (simulcast: by rid, else ssrc, else the stat id — SPEC `RtcStatsSample.layer`), each a reading. */
export type Layers = Map<string, Sample>;

/** The report's RTP streams, each resolved to a published or subscribed track by its `MediaStreamTrack` id. */
export function peerSamples(
  report: RTCStatsReport,
  tracks: Map<string, TrackRef>,
): Map<string, { ref: TrackRef; layers: Layers }> {
  const stats = new Map<string, Stat>();
  report.forEach((stat: Stat) => stats.set(stat.id, stat));
  const all = Array.from(stats.values());
  // The transport's selected pair, else the nominated succeeded one (not every browser names it).
  const selectedId = all.find(
    (s) => s.type === 'transport' && s.selectedCandidatePairId,
  )?.selectedCandidatePairId;
  const pair =
    (selectedId && stats.get(selectedId)) ??
    all.find(
      (s) =>
        s.type === 'candidate-pair' && (s.selected || (s.nominated && s.state === 'succeeded')),
    );
  const pairRtt = ms(pair?.currentRoundTripTime);
  const out = new Map<string, { ref: TrackRef; layers: Layers }>();
  for (const stat of all) {
    const outbound = stat.type === 'outbound-rtp';
    if (!outbound && stat.type !== 'inbound-rtp') continue;
    const trackId = outbound
      ? (stats.get(stat.mediaSourceId)?.trackIdentifier ?? stat.trackIdentifier)
      : stat.trackIdentifier;
    const ref = tracks.get(trackId);
    if (!ref || (ref.direction === 'outbound') !== outbound) continue;
    let entry = out.get(ref.sid);
    if (!entry) {
      entry = { ref, layers: new Map() };
      out.set(ref.sid, entry);
    }
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const set = (target: Record<string, number>, key: string, value: number | undefined) => {
      if (value !== undefined && Number.isFinite(value)) target[key] = value;
    };
    if (outbound) {
      set(counters, 'lk.rtc.bytes', stat.bytesSent);
      set(counters, 'lk.rtc.packets', stat.packetsSent);
      set(gauges, 'lk.rtc.fps', stat.framesPerSecond);
      // The remote-inbound stream the stat names, else the one naming the stat (`localId`).
      const remote =
        stats.get(stat.remoteId) ??
        all.find((s) => s.type === 'remote-inbound-rtp' && s.localId === stat.id);
      set(gauges, 'lk.rtc.rtt_ms', ms(remote?.roundTripTime));
      const limits = stat.qualityLimitationDurations;
      if (limits) {
        set(counters, 'lk.rtc.quality_limitation.bandwidth_ms', msInt(limits.bandwidth));
        set(counters, 'lk.rtc.quality_limitation.cpu_ms', msInt(limits.cpu));
        set(counters, 'lk.rtc.quality_limitation.other_ms', msInt(limits.other));
      }
    } else {
      set(counters, 'lk.rtc.bytes', stat.bytesReceived);
      set(counters, 'lk.rtc.packets', stat.packetsReceived);
      set(counters, 'lk.rtc.packets_lost', stat.packetsLost);
      set(counters, 'lk.rtc.freeze_count', stat.freezeCount);
      set(counters, 'lk.rtc.freezes_duration_ms', msInt(stat.totalFreezesDuration));
      set(counters, 'lk.rtc.pause_count', stat.pauseCount);
      set(counters, 'lk.rtc.pauses_duration_ms', msInt(stat.totalPausesDuration));
      set(counters, 'lk.rtc.concealed_samples', stat.concealedSamples);
      set(counters, 'lk.rtc.concealment_events', stat.concealmentEvents);
      set(counters, 'lk.rtc.silent_concealed_samples', stat.silentConcealedSamples);
      set(counters, 'lk.rtc.interruption_count', stat.interruptionCount);
      set(counters, 'lk.rtc.interruptions_duration_ms', msInt(stat.totalInterruptionDuration));
      set(counters, 'lk.rtc.jitter_buffer_delay_ms', msInt(stat.jitterBufferDelay));
      set(counters, 'lk.rtc.jitter_buffer_emitted_count', stat.jitterBufferEmittedCount);
      set(gauges, 'lk.rtc.jitter_ms', ms(stat.jitter));
      set(gauges, 'lk.rtc.fps', stat.framesPerSecond);
      set(gauges, 'lk.rtc.audio_level', stat.audioLevel);
      set(gauges, 'lk.rtc.rtt_ms', pairRtt);
    }
    const codec = stats.get(stat.codecId)?.mimeType;
    entry.layers.set(String(stat.rid ?? stat.ssrc ?? stat.id), { codec, counters, gauges });
  }
  return out;
}

/**
 * One track's layers folded into one reading, as the core does: cumulative counters summed across
 * every layer ever seen (quality-limitation durations are per encoder: the maximum), gauges and
 * codec only from the layers in this reading (`fresh`), the maximum across them.
 */
export function foldLayers(layers: Layers, fresh: Iterable<string> = layers.keys()): Sample {
  const sample: Sample = { counters: {}, gauges: {} };
  for (const layer of layers.values()) {
    for (const [key, value] of Object.entries(layer.counters)) {
      const current = sample.counters[key];
      sample.counters[key] = key.startsWith('lk.rtc.quality_limitation.')
        ? Math.max(current ?? -Infinity, value)
        : (current ?? 0) + value;
    }
  }
  for (const id of fresh) {
    const layer = layers.get(id);
    if (!layer) continue;
    sample.codec ??= layer.codec;
    for (const [key, value] of Object.entries(layer.gauges)) {
      sample.gauges[key] = Math.max(sample.gauges[key] ?? -Infinity, value);
    }
  }
  return sample;
}

interface Gauge {
  min: number;
  max: number;
  sum: number;
  count: number;
}

export class StatsWindow {
  readonly started = Date.now();

  samples = 0;

  codec?: string;

  private counters: Record<string, number> = {};

  private gauges = new Map<string, Gauge>();

  add(sample: Sample) {
    this.samples += 1;
    this.codec = sample.codec ?? this.codec;
    Object.assign(this.counters, sample.counters);
    for (const [key, value] of Object.entries(sample.gauges)) {
      if (!Number.isFinite(value)) continue;
      const gauge = this.gauges.get(key);
      if (!gauge) {
        this.gauges.set(key, { min: value, max: value, sum: value, count: 1 });
      } else {
        gauge.min = Math.min(gauge.min, value);
        gauge.max = Math.max(gauge.max, value);
        gauge.sum += value;
        gauge.count += 1;
      }
    }
  }

  attributes(): Attributes {
    const attributes: Attributes = {
      'lk.rtc.window_ms': Date.now() - this.started,
      'lk.rtc.samples': this.samples,
      'lk.rtc.codec': this.codec,
      ...this.counters,
    };
    for (const [key, gauge] of this.gauges) {
      attributes[`${key}.min`] = gauge.min;
      attributes[`${key}.max`] = gauge.max;
      attributes[`${key}.avg`] = gauge.sum / gauge.count;
    }
    return attributes;
  }
}
