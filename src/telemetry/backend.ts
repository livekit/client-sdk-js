/**
 * The seam between what this SDK *observes* and what carries it.
 *
 * These are the same operations `livekit-telemetry/SPEC.md` defines as the typed surface the Swift,
 * Kotlin and Dart SDKs cross into the Rust core: verbs about rooms, spans, tracks and outcomes, and
 * nothing about a platform. That is deliberate — the Room instrumentation in this package is the
 * part worth having once, and a platform that carries telemetry differently (React Native binds the
 * Rust core) implements these interfaces instead of reimplementing the instrumentation.
 *
 * The browser's implementation is `Pipeline` + `PipelineScope`; `Telemetry.setBackend` installs
 * another. Nothing here may name a capability only some platforms have.
 */
import type { DeviceState } from './device';
import type { Attributes } from './otlp';

export type Outcome = 'ok' | 'error' | 'cancelled';

export type TrackDirection = 'inbound' | 'outbound';

export type Severity = 'info' | 'warn' | 'error';

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

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

/**
 * One attempt at an operation. Calls are synchronous and the implementation stamps the clock, so
 * the only skew is the call itself — a backend that crosses a native boundary must use a blocking
 * call, not a promise.
 */
export interface Span {
  /** A checkpoint inside the attempt: `ws_open`, `join_recv`, `first_media`, `attempt 2 full`. */
  step(name: string): void;
  setAttribute(key: string, value: Attributes[string]): void;
  /** Ending twice is a no-op. */
  end(outcome?: Outcome, errorType?: string, message?: string): void;
  fail(error: unknown): void;
  cancel(): void;
  context(): TraceContext;
}

/** One Room connection: a trace id, the attributes its records carry, its spans and its windows. */
export interface Scope {
  readonly traceId: string;
  setRoom(identity: RoomIdentity): void;
  start(name: string, options?: { kind?: number; attributes?: Attributes; parent?: Span }): Span;
  emit(event: string, attributes?: Attributes, severity?: Severity, span?: Span): void;
  recordStats(
    sid: string,
    kind: 'audio' | 'video',
    direction: TrackDirection,
    sample: StatsSample,
  ): void;
  subscribeStarted(sid: string, attributes: Attributes): void;
  subscribeEnded(sid: string, outcome: Outcome, errorType?: string): void;
  disconnected(reason: string): void;
  /** The call is ending: close the open windows early and cancel what never resolved. */
  close(): void;
}

export interface Backend {
  readonly enabled: boolean;
  /** LiveKit Cloud: the server URL and the connect token are the destination. */
  setServer(serverUrl: string, token: string): void;
  scope(): Scope;
  /** Uploads stop, collection does not — spans that own the uplink raise a hold. */
  hold(up: boolean): void;
  /** Only what the platform running this code can actually answer; see `DeviceState`. */
  deviceState(state: DeviceState): void;
  /**
   * A record belonging to the pipeline rather than to any call. A platform that observes something
   * this package has no vocabulary for — a phone's thermal state, say — names the event itself.
   */
  emit(event: string, attributes?: Attributes, severity?: Severity): void;
  /**
   * Stretch the flush interval and the stats window by this much, 1–4. The platform that can see
   * pressure this package cannot reports the number, not the reason.
   */
  setCadenceFactor(factor: number): void;
  flush(): Promise<void>;
  diagnostics(): string;
  shutdown(): Promise<void>;
}
