/**
 * Client telemetry. One pipeline per page (or per app), one scope per Room connection; see
 * TELEMETRY.md for the design and `livekit-telemetry/SPEC.md` in rust-sdks for what the records
 * mean — the Swift, Kotlin and Dart SDKs emit the same ones from the Rust core.
 *
 * Nothing is collected until a destination exists: `Telemetry.configure({ endpoint })` for your own
 * collector, or the first connect to LiveKit Cloud, which derives the route and the token itself.
 *
 * Where batches wait between being made and being accepted is the one replaceable part
 * (`TelemetryOptions.storage`): a browser keeps them in memory, a platform with a filesystem
 * keeps them on disk. Everything else is this package's.
 */
import { type DeviceState, observeBrowser } from './device';
import { type Attributes, Severity, hrTime, randomHex } from './otlp';
import { Pipeline, type TelemetryOptions } from './pipeline';
import type { StatsSample, TelemetryScope, TrackDirection } from './scope';
import { receiverSample, senderSample } from './webrtc';

export type { TelemetryOptions } from './pipeline';
export type { DeviceState, AppStateName, NetworkType } from './device';
export type {
  Outcome,
  RoomIdentity,
  SeverityName,
  StatsSample,
  TrackDirection,
  TraceContext,
} from './scope';
export type { TelemetryScope, TelemetrySpan } from './scope';
export { SpanKind } from './otlp';
export type { Attributes } from './otlp';
export type { TelemetryStorage } from './storage';

const pipeline = new Pipeline();

/** Which scope a track's stats belong to — the monitors know a sid, not a Room. */
interface TrackRegistration {
  scope: TelemetryScope;
  kind: 'audio' | 'video';
  direction: TrackDirection;
}

const tracks = new Map<string, TrackRegistration>();

let lifecycleAttached = false;

function attachLifecycle() {
  if (lifecycleAttached || typeof document === 'undefined') return;
  lifecycleAttached = true;
  // The page's last chance: `pagehide` and a hidden tab, never `unload` — by then a request has
  // no chance of leaving. `fetch(keepalive)` makes it best effort, not durable (TELEMETRY.md §3).
  const flush = () => {
    pipeline.flush().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  observeBrowser((state) => Telemetry.deviceState(state));
}

export const Telemetry = {
  /** Point the default pipeline at a collector and start it. Safe to call more than once. */
  configure(options: TelemetryOptions) {
    pipeline.configure(options);
    attachLifecycle();
  },

  /** LiveKit Cloud: the server URL and the connect token are the destination (SPEC). */
  setServer(serverUrl: string, token: string) {
    pipeline.setServer(serverUrl, token);
    attachLifecycle();
  },

  get enabled(): boolean {
    return pipeline.enabled;
  },

  scope(): TelemetryScope {
    return pipeline.scope();
  },

  /** Uploads stop, collection does not — spans that own the uplink raise a hold (SPEC). */
  hold(up: boolean) {
    pipeline.hold(up);
  },

  /** What the platform can say about the device it runs on; see `DeviceState` for the limits. */
  deviceState(state: DeviceState) {
    pipeline.deviceState(state);
  },

  /**
   * A record belonging to the pipeline rather than to any call. A platform SDK that observes
   * something this package has no vocabulary for — a phone's thermal state — names it here.
   */
  emit(event: string, attributes?: Attributes, severity?: 'info' | 'warn' | 'error') {
    pipeline.emit(event, attributes, severity);
  },

  /**
   * Stretch the flush interval and the stats window by this much, 1–4. The platform that can see
   * pressure this package cannot reports the number, not the reason.
   */
  setCadenceFactor(factor: number) {
    pipeline.setCadenceFactor(factor);
  },

  registerTrack(
    sid: string,
    scope: TelemetryScope,
    kind: 'audio' | 'video',
    direction: TrackDirection,
  ) {
    // Nothing to route when nobody is listening: an SDK without a collector keeps no map.
    if (!pipeline.enabled) return;
    tracks.set(`${sid}:${direction}`, { scope, kind, direction });
  },

  unregisterTrack(sid: string, direction: TrackDirection) {
    tracks.delete(`${sid}:${direction}`);
  },

  /** What a local track's monitor just read; simulcast layers arrive together. */
  senderStats(sid: string | undefined, stats: Parameters<typeof senderSample>[0]) {
    if (sid) Telemetry.trackStats(sid, 'outbound', senderSample(stats));
  },

  /** What a remote track's monitor just read. */
  receiverStats(sid: string | undefined, stats: Parameters<typeof receiverSample>[0] | undefined) {
    if (sid && stats) Telemetry.trackStats(sid, 'inbound', receiverSample(stats));
  },

  /** Called from the SDK's existing per-track monitors: no extra `getStats()` anywhere. */
  trackStats(sid: string, direction: TrackDirection, sample: StatsSample) {
    if (!pipeline.enabled) return;
    const registration = tracks.get(`${sid}:${direction}`);
    if (!registration) return;
    registration.scope.recordStats(sid, registration.kind, direction, sample);
  },

  flush(): Promise<void> {
    return pipeline.flush();
  },

  diagnostics(): string {
    return pipeline.diagnostics();
  },

  /** A pipeline smoke test: one record, one request, whatever the collector answers. */
  ping(seq = 1) {
    const now = hrTime();
    pipeline.record({
      hrTime: now,
      hrTimeObserved: now,
      eventName: 'lk.ping',
      severityNumber: Severity.info,
      severityText: 'INFO',
      body: 'lk.ping',
      attributes: { 'lk.ping.seq': seq, 'otel.event.name': 'lk.ping' },
      droppedAttributesCount: 0,
      resource: { attributes: {} },
      instrumentationScope: { name: 'livekit-telemetry', version: '0.1.0' },
      spanContext: { traceId: randomHex(16), spanId: randomHex(8), traceFlags: 1 },
    });
    return pipeline.flush(true);
  },

  async shutdown() {
    tracks.clear();
    await pipeline.shutdown();
  },
};
