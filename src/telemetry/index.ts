/**
 * Client telemetry. One pipeline per page (or per app), one scope per Room connection; see
 * TELEMETRY.md for the design and `livekit-telemetry/SPEC.md` in rust-sdks for what the records
 * mean — the Swift, Kotlin and Dart SDKs emit the same ones from the Rust core.
 *
 * Nothing is collected until a destination exists: `Telemetry.configure({ endpoint })` for your own
 * collector, or the first connect to LiveKit Cloud, which derives the route and the token itself.
 */
import { type DeviceState, cadenceFactor, changes, observeBrowser } from './device';
import { Severity, hrTime, randomHex } from './otlp';
import { Pipeline, type TelemetryOptions } from './pipeline';
import { type StatsSample, TelemetryScope, type TrackDirection } from './scope';
import { receiverSample, senderSample } from './webrtc';

export type { TelemetryOptions } from './pipeline';
export type {
  DeviceState,
  AppStateName,
  ThermalState,
  MemoryPressure,
  NetworkType,
} from './device';
export type { StatsSample, TrackDirection, RoomIdentity, Outcome } from './scope';
export { TelemetryScope, TelemetrySpan } from './scope';
export { SpanKind } from './otlp';

const pipeline = new Pipeline();

/** Which scope a track's stats belong to — the monitors know a sid, not a Room. */
interface TrackRegistration {
  scope: TelemetryScope;
  kind: 'audio' | 'video';
  direction: TrackDirection;
}

const tracks = new Map<string, TrackRegistration>();

/** Device state belongs to no call: it is filed under the pipeline's own scope (SPEC). */
let processScope: TelemetryScope | undefined;

let deviceState: DeviceState = {};

let lifecycleAttached = false;

function attachLifecycle() {
  if (lifecycleAttached || typeof document === 'undefined') return;
  lifecycleAttached = true;
  // The page's last chance: `pagehide` and a hidden tab, never `unload` — by then a request has
  // no chance of leaving. `fetch(keepalive)` makes it best effort, not durable (TELEMETRY.md §3).
  const flush = () => {
    pipeline.flush(true).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  observeBrowser((state) => Telemetry.deviceState(state));
}

export const Telemetry = {
  /** Point the pipeline at a collector and start it. Safe to call more than once. */
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
    return new TelemetryScope(pipeline);
  },

  /** Uploads stop, collection does not — spans that own the uplink raise a hold (SPEC). */
  hold(up: boolean) {
    pipeline.hold(up);
  },

  /**
   * What the platform now says about the device. A page reports what it can see; React Native
   * reports the rest from its native module. Each group becomes an `lk.device.*` record the first
   * time it is seen and on every change after, and the whole state sets the cadence factor.
   */
  deviceState(state: DeviceState) {
    const next = { ...deviceState, ...state };
    const records = changes(deviceState, next);
    deviceState = next;
    if (pipeline.enabled) {
      processScope ??= new TelemetryScope(pipeline);
      for (const record of records) {
        processScope.emit(record.event, record.attributes);
      }
    }
    pipeline.setCadenceFactor(cadenceFactor(next));
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
    return pipeline.flush(true);
  },

  diagnostics(): string {
    return pipeline.diagnostics();
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
    processScope = undefined;
    await pipeline.shutdown();
  },
};
