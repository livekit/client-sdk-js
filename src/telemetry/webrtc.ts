/**
 * The SDK's per-track monitors already parse `getStats()` every two seconds; this turns what they
 * hold into one SPEC reading, in SPEC units. Nothing here calls `getStats()` — measuring a call
 * must not cost a second poll.
 */
import type {
  AudioReceiverStats,
  AudioSenderStats,
  VideoReceiverStats,
  VideoSenderStats,
} from '../room/stats';
import type { StatsSample } from './scope';

const seconds = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : value * 1000;

function add(total: number | undefined, value: number | undefined): number | undefined {
  if (value === undefined) return total;
  return (total ?? 0) + value;
}

/** Simulcast layers are one track: their counters sum, their gauges take the liveliest layer. */
export function senderSample(stats: Array<AudioSenderStats | VideoSenderStats>): StatsSample {
  const sample: StatsSample = {};
  for (const layer of stats) {
    sample.bytes = add(sample.bytes, layer.bytesSent);
    sample.packets = add(sample.packets, layer.packetsSent);
    sample.packetsLost = add(sample.packetsLost, layer.packetsLost);
    sample.jitterMs = Math.max(sample.jitterMs ?? 0, seconds(layer.jitter) ?? 0) || undefined;
    sample.rttMs = Math.max(sample.rttMs ?? 0, seconds(layer.roundTripTime) ?? 0) || undefined;
    if (layer.type === 'video') {
      sample.fps = Math.max(sample.fps ?? 0, layer.framesPerSecond ?? 0) || undefined;
      const durations = layer.qualityLimitationDurations;
      if (durations) {
        sample.qualityLimitationBandwidthMs = add(
          sample.qualityLimitationBandwidthMs,
          seconds(durations.bandwidth),
        );
        sample.qualityLimitationCpuMs = add(sample.qualityLimitationCpuMs, seconds(durations.cpu));
        sample.qualityLimitationOtherMs = add(
          sample.qualityLimitationOtherMs,
          seconds(durations.other),
        );
      }
    }
  }
  return sample;
}

export function receiverSample(stats: AudioReceiverStats | VideoReceiverStats): StatsSample {
  const sample: StatsSample = {
    codec: 'mimeType' in stats ? stats.mimeType : undefined,
    bytes: stats.bytesReceived,
    packets: stats.packetsReceived,
    packetsLost: stats.packetsLost,
    jitterMs: seconds(stats.jitter),
    jitterBufferDelayMs: seconds(stats.jitterBufferDelay),
  };
  if (stats.type === 'video') {
    sample.framesDropped = stats.framesDropped;
  } else {
    sample.concealedSamples = stats.concealedSamples;
    sample.concealmentEvents = stats.concealmentEvents;
    sample.silentConcealedSamples = stats.silentConcealedSamples;
  }
  return sample;
}
