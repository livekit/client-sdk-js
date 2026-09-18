/**
 * Client telemetry. One pipeline per page (or per app), one scope per Room connection; see
 * TELEMETRY.md for the design and `livekit-telemetry/SPEC.md` in rust-sdks for what the records
 * mean — the Swift, Kotlin and Dart SDKs emit the same ones from the Rust core.
 *
 * Nothing is collected until a destination exists: `Telemetry.configure({ endpoint })` for your own
 * collector, or the first connect to LiveKit Cloud, which derives the route and the token itself.
 *
 * What carries the records is replaceable (`setBackend`) — the Room instrumentation in this package
 * is worth having once, while a platform may know a better way to batch, cache and upload. The
 * default is the browser pipeline in `pipeline.ts`.
 */
import type { Backend, Scope, StatsSample, TrackDirection } from './backend';
import { type DeviceState, observeBrowser } from './device';
import { Severity, hrTime, randomHex } from './otlp';
import { Pipeline, type TelemetryOptions } from './pipeline';
import { receiverSample, senderSample } from './webrtc';

export type { TelemetryOptions } from './pipeline';
export type { DeviceState, AppStateName, NetworkType } from './device';
export type {
  Backend,
  Scope,
  Span,
  Outcome,
  RoomIdentity,
  Severity as SeverityName,
  StatsSample,
  TrackDirection,
  TraceContext,
} from './backend';
export { SpanKind } from './otlp';

const pipeline = new Pipeline();

let backend: Backend = pipeline;

/** Which scope a track's stats belong to — the monitors know a sid, not a Room. */
interface TrackRegistration {
  scope: Scope;
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
    backend.flush().catch(() => {});
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

  /**
   * Replace what carries the records — a platform SDK that binds a different implementation of
   * `Backend` installs it here, before any Room is created. The instrumentation does not change.
   * Returns the backend that was in place, so it can be put back.
   */
  setBackend(replacement: Backend): Backend {
    const previous = backend;
    backend = replacement;
    return previous;
  },

  /** LiveKit Cloud: the server URL and the connect token are the destination (SPEC). */
  setServer(serverUrl: string, token: string) {
    backend.setServer(serverUrl, token);
    attachLifecycle();
  },

  get enabled(): boolean {
    return backend.enabled;
  },

  scope(): Scope {
    return backend.scope();
  },

  /** Uploads stop, collection does not — spans that own the uplink raise a hold (SPEC). */
  hold(up: boolean) {
    backend.hold(up);
  },

  /** What the platform can say about the device it runs on; see `DeviceState` for the limits. */
  deviceState(state: DeviceState) {
    backend.deviceState(state);
  },

  registerTrack(sid: string, scope: Scope, kind: 'audio' | 'video', direction: TrackDirection) {
    // Nothing to route when nobody is listening: an SDK without a collector keeps no map.
    if (!backend.enabled) return;
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
    if (!backend.enabled) return;
    const registration = tracks.get(`${sid}:${direction}`);
    if (!registration) return;
    registration.scope.recordStats(sid, registration.kind, direction, sample);
  },

  flush(): Promise<void> {
    return backend.flush();
  },

  diagnostics(): string {
    return backend.diagnostics();
  },

  /** A pipeline smoke test: one record, one request, whatever the collector answers. */
  ping(seq = 1) {
    const now = hrTime();
    pipeline.emit({
      hrTime: now,
      hrTimeObserved: now,
      eventName: 'lk.ping',
      severityNumber: Severity.info,
      severityText: 'INFO',
      body: 'lk.ping',
      attributes: { 'lk.ping.seq': seq },
      droppedAttributesCount: 0,
      resource: { attributes: {} },
      instrumentationScope: { name: 'livekit-telemetry', version: '0.1.0' },
      spanContext: { traceId: randomHex(16), spanId: randomHex(8), traceFlags: 1 },
    });
    return pipeline.flush(true);
  },

  async shutdown() {
    tracks.clear();
    await backend.shutdown();
  },
};
