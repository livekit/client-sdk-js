/**
 * One scope per Room connection: a trace id, the attributes every record of that call carries, the
 * spans, and the stats windows. The scope is not ended — a call's last record is simply its last.
 */
import {
  type Attributes,
  INSTRUMENTATION_SCOPE,
  type LogRecord,
  Severity,
  SpanKind,
  type SpanRecord,
  SpanStatus,
  hrDuration,
  hrTime,
  randomHex,
} from './otlp';
import type { Pipeline } from './pipeline';

export type Outcome = 'ok' | 'error' | 'cancelled';

export type TrackDirection = 'inbound' | 'outbound';

export interface RoomIdentity {
  sid?: string;
  name?: string;
  participantSid?: string;
  participantIdentity?: string;
}

/** One track's reading, already in SPEC units: milliseconds, not the WebRTC seconds. */
export interface StatsSample {
  codec?: string;
  bytes?: number;
  packets?: number;
  packetsLost?: number;
  framesDropped?: number;
  concealedSamples?: number;
  concealmentEvents?: number;
  silentConcealedSamples?: number;
  jitterBufferDelayMs?: number;
  qualityLimitationBandwidthMs?: number;
  qualityLimitationCpuMs?: number;
  qualityLimitationOtherMs?: number;
  jitterMs?: number;
  rttMs?: number;
  fps?: number;
  audioLevel?: number;
}

const COUNTERS = [
  ['bytes', 'lk.rtc.bytes'],
  ['packets', 'lk.rtc.packets'],
  ['packetsLost', 'lk.rtc.packets_lost'],
  ['framesDropped', 'lk.rtc.frames_dropped'],
  ['concealedSamples', 'lk.rtc.concealed_samples'],
  ['concealmentEvents', 'lk.rtc.concealment_events'],
  ['silentConcealedSamples', 'lk.rtc.silent_concealed_samples'],
  ['jitterBufferDelayMs', 'lk.rtc.jitter_buffer_delay_ms'],
  ['qualityLimitationBandwidthMs', 'lk.rtc.quality_limitation.bandwidth_ms'],
  ['qualityLimitationCpuMs', 'lk.rtc.quality_limitation.cpu_ms'],
  ['qualityLimitationOtherMs', 'lk.rtc.quality_limitation.other_ms'],
] as const;

const GAUGES = [
  ['jitterMs', 'lk.rtc.jitter_ms'],
  ['rttMs', 'lk.rtc.rtt_ms'],
  ['fps', 'lk.rtc.fps'],
  ['audioLevel', 'lk.rtc.audio_level'],
] as const;

interface Gauge {
  min: number;
  max: number;
  sum: number;
  count: number;
}

/** Counters are reported as the window's last reading (the W3C webrtc-stats model: monotonic);
 *  gauges as min/max/avg over it. */
class Window {
  started = Date.now();

  samples = 0;

  codec?: string;

  last: StatsSample = {};

  gauges = new Map<string, Gauge>();

  add(sample: StatsSample) {
    this.samples += 1;
    this.codec = sample.codec ?? this.codec;
    for (const [field] of COUNTERS) {
      const value = sample[field];
      if (value !== undefined) this.last[field] = value;
    }
    for (const [field] of GAUGES) {
      const value = sample[field];
      if (value === undefined || Number.isNaN(value)) continue;
      const gauge = this.gauges.get(field);
      if (!gauge) {
        this.gauges.set(field, { min: value, max: value, sum: value, count: 1 });
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
    };
    if (this.codec) attributes['lk.rtc.codec'] = this.codec;
    for (const [field, key] of COUNTERS) {
      const value = this.last[field];
      if (value !== undefined) attributes[key] = Math.round(value);
    }
    for (const [field, key] of GAUGES) {
      const gauge = this.gauges.get(field);
      if (!gauge) continue;
      attributes[`${key}.min`] = gauge.min;
      attributes[`${key}.max`] = gauge.max;
      attributes[`${key}.avg`] = gauge.sum / gauge.count;
    }
    return attributes;
  }
}

export class TelemetrySpan {
  private events: SpanRecord['events'] = [];

  private attributes: Attributes;

  private startTime = hrTime();

  private finished = false;

  private spanId = randomHex(8);

  constructor(
    private scope: TelemetryScope,
    private pipeline: Pipeline,
    private name: string,
    private kind: number,
    attributes: Attributes,
    private parent?: { traceId: string; spanId: string; traceFlags: number },
  ) {
    this.attributes = { ...attributes };
  }

  /** A checkpoint inside the attempt — `ws_open`, `join_recv`, `first_media`, `attempt 2 full`. */
  step(name: string) {
    if (this.finished) return;
    this.events.push({ name, time: hrTime(), attributes: {}, droppedAttributesCount: 0 });
  }

  setAttribute(key: string, value: Attributes[string]) {
    this.attributes[key] = value;
  }

  context() {
    return { traceId: this.scope.traceId, spanId: this.spanId, traceFlags: 1 };
  }

  /** Ending twice is a no-op, as on every other platform. */
  end(outcome: Outcome = 'ok', errorType?: string, message?: string) {
    if (this.finished) return;
    this.finished = true;
    const endTime = hrTime();
    this.attributes['lk.outcome'] = outcome;
    if (errorType) this.attributes['error.type'] = errorType;
    this.pipeline.endSpan({
      name: this.name,
      kind: this.kind,
      spanContext: () => this.context(),
      parentSpanContext: this.parent,
      startTime: this.startTime,
      endTime,
      duration: hrDuration(this.startTime, endTime),
      // Cancellation is `Unset` like success: only a failure is an error (SPEC).
      status:
        outcome === 'error' ? { code: SpanStatus.error, message } : { code: SpanStatus.unset },
      attributes: { ...this.scope.attributes(), ...this.attributes },
      links: [],
      events: this.events,
      ended: true,
      resource: { attributes: {} },
      instrumentationScope: INSTRUMENTATION_SCOPE,
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    });
  }

  fail(error: unknown) {
    const type = error instanceof Error ? error.name : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    this.end('error', type, message);
  }

  cancel() {
    this.end('cancelled');
  }
}

export class TelemetryScope {
  readonly traceId = randomHex(16);

  private room: RoomIdentity = {};

  private windows = new Map<string, { window: Window; kind: string; direction: TrackDirection }>();

  private pendingSubscribes = new Map<string, TelemetrySpan>();

  constructor(private pipeline: Pipeline) {}

  attributes(): Attributes {
    return {
      'session.id': this.traceId,
      'lk.room.sid': this.room.sid,
      'lk.room.name': this.room.name,
      'lk.participant.sid': this.room.participantSid,
      'lk.participant.identity': this.room.participantIdentity,
    };
  }

  setRoom(identity: RoomIdentity) {
    this.room = { ...this.room, ...identity };
  }

  start(
    name: string,
    options: { kind?: number; attributes?: Attributes; parent?: TelemetrySpan } = {},
  ): TelemetrySpan {
    return new TelemetrySpan(
      this,
      this.pipeline,
      name,
      options.kind ?? SpanKind.internal,
      options.attributes ?? {},
      options.parent?.context(),
    );
  }

  emit(
    eventName: string,
    attributes: Attributes = {},
    severity: keyof typeof Severity = 'info',
    span?: TelemetrySpan,
  ) {
    const now = hrTime();
    const record: LogRecord = {
      hrTime: now,
      hrTimeObserved: now,
      eventName,
      severityNumber: Severity[severity],
      severityText: severity.toUpperCase(),
      // Log viewers key their line on the body, and not every backend surfaces event_name yet.
      body: eventName,
      attributes: { ...this.attributes(), ...attributes },
      droppedAttributesCount: 0,
      resource: { attributes: {} },
      instrumentationScope: INSTRUMENTATION_SCOPE,
      spanContext: span?.context() ?? { traceId: this.traceId, spanId: '', traceFlags: 1 },
    };
    this.pipeline.emit(record, { exemptFromFlood: eventName === 'lk.rtc.stats.sample' });
  }

  disconnected(reason: string) {
    this.emit(
      'lk.room.disconnected',
      { 'lk.disconnect.reason': reason },
      reason === 'client_initiated' ? 'info' : 'warn',
    );
  }

  /** The intent to subscribe exists; the window that sees the first inbound bytes ends the span. */
  subscribeStarted(sid: string, attributes: Attributes) {
    if (this.pendingSubscribes.has(sid)) return;
    const span = this.start('lk.subscribe', { attributes: { 'lk.track.sid': sid, ...attributes } });
    span.step('subscribed');
    this.pendingSubscribes.set(sid, span);
  }

  subscribeEnded(sid: string, outcome: Outcome, errorType?: string) {
    const span = this.pendingSubscribes.get(sid);
    if (!span) return;
    this.pendingSubscribes.delete(sid);
    span.end(outcome, errorType);
  }

  recordStats(
    sid: string,
    kind: 'audio' | 'video',
    direction: TrackDirection,
    sample: StatsSample,
  ) {
    const key = `${sid}:${direction}`;
    let entry = this.windows.get(key);
    if (!entry) {
      entry = { window: new Window(), kind, direction };
      this.windows.set(key, entry);
    }
    entry.window.add(sample);
    if (direction === 'inbound' && (sample.bytes ?? 0) > 0) {
      const span = this.pendingSubscribes.get(sid);
      if (span) {
        span.step('first_media');
        this.subscribeEnded(sid, 'ok');
      }
    }
    if (Date.now() - entry.window.started >= this.pipeline.statsWindow * 1000) {
      this.closeWindow(sid, key);
    }
  }

  private closeWindow(sid: string, key: string) {
    const entry = this.windows.get(key);
    if (!entry || entry.window.samples === 0) return;
    this.windows.delete(key);
    this.emit('lk.rtc.stats.sample', {
      'lk.track.sid': sid,
      'lk.track.kind': entry.kind,
      'lk.track.direction': entry.direction,
      ...entry.window.attributes(),
    });
  }

  /** Closes every open window early — the call is ending and a partial window beats none. */
  close() {
    for (const key of Array.from(this.windows.keys())) {
      this.closeWindow(key.slice(0, key.lastIndexOf(':')), key);
    }
    for (const sid of Array.from(this.pendingSubscribes.keys())) {
      this.subscribeEnded(sid, 'cancelled');
    }
  }
}
