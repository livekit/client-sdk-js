/**
 * Client telemetry: the pipeline the native SDKs get from the Rust core (`livekit-telemetry/SPEC.md`
 * in rust-sdks is the contract), in TypeScript. One pipeline per process, installed with the first
 * Room; one scope per Room. Public API: `disableTelemetry()`, `Room.emitTelemetryEvent()`,
 * `Room.setTelemetryAttribute()`; `configureTelemetryHost()` is the one internal seam React Native wires.
 */
import { LOG_OWNER, LogLevel, setLogCapture } from '../logger';
import { getBrowser } from '../utils/browserParser';
import { version } from '../version';
import { type DeviceState, captureFailureReason, observeBrowser } from './device';
import { type Attributes, mask } from './otlp';
import { Pipeline } from './pipeline';
import { type PeerStatsSource, StatsPoller } from './poller';
import { TelemetryScope, diagnose, guarded } from './scope';
import type { TelemetryStorage } from './storage';

export type { DeviceState } from './device';
export type { Attributes } from './otlp';
export type { PeerStatsSource, StatsPoller } from './poller';
export type { TelemetryScope, TelemetrySpan, SpanTrack } from './scope';
export { disconnectReasonName } from './scope';
export type { TelemetryStorage } from './storage';
export type { TrackRef } from './webrtc';

/**
 * @internal
 * What a non-browser host supplies, once at app start before its first Room: React Native sets
 * `sdk` (resource names), `storage` (a file-backed cache) and `observeDevice` (the state a phone
 * can see, reported on change with its initial value, plus the device events a page cannot observe).
 * Local e2e runs set `endpoint`, a collector base URL that receives everything without Cloud rules
 * or tokens (the `LK_TELEMETRY_ENDPOINT` of the native cores).
 */
export interface TelemetryHost {
  sdk?: { name: string; version: string; os?: string; osVersion?: string; deviceModel?: string };
  storage?: TelemetryStorage;
  /** Returns the stop function. Without it, the browser's visibility and connection are observed. */
  observeDevice?: (
    report: (state: DeviceState) => void,
    event: (name: string, attributes: Attributes) => void,
  ) => (() => void) | void;
  endpoint?: string;
}

const pipeline = new Pipeline();
/** The Room's scope, reachable from its local participant without a field on the public class. */
const scopes = new WeakMap<object, TelemetryScope>();
let host: TelemetryHost = {};
let installed = false;
let stopDevice: (() => void) | undefined;

function onLog(level: LogLevel, message: unknown, context?: object, logger?: string) {
  if (pipeline.disabled || level < LogLevel.warn) return;
  const body = mask(String(message));
  const severity = level === LogLevel.error ? 'error' : 'warn';
  const carried = (context as Record<symbol, unknown> | undefined)?.[LOG_OWNER];
  const owner = carried instanceof WeakRef ? carried.deref() : carried;
  const roomShaped = context !== undefined && ('roomID' in context || 'room' in context);
  // A line is its Room's by identity only: the Room's logger carries its scope. A Room-shaped
  // context with no scope behind it is nobody's, dropped and counted; a line with no Room context
  // at all is the process's.
  if (owner instanceof TelemetryScope) owner.log(severity, body, logger ?? 'livekit');
  else if (roomShaped) pipeline.count('dropped.unattributed');
  else pipeline.log(severity, body, logger ?? 'livekit');
}

function applyHost() {
  pipeline.endpoint = host.endpoint;
  if (host.storage) pipeline.storage = host.storage;
  const browser = host.sdk ? undefined : getBrowser();
  pipeline.resource = {
    'service.name': `livekit-client-${host.sdk?.name ?? 'js'}`,
    'service.version': host.sdk?.version ?? version,
    'telemetry.sdk.name': 'livekit-telemetry',
    'telemetry.sdk.language': 'webjs',
    'telemetry.sdk.version': '0.1.0',
    'os.name': host.sdk?.os,
    'os.version': host.sdk?.osVersion,
    'device.model.identifier': host.sdk?.deviceModel,
    'browser.name': browser?.name,
    'browser.version': browser?.version,
  };
  stopDevice?.();
  const report = (state: DeviceState) => pipeline.deviceState(state);
  const event = (name: string, attributes: Attributes) => pipeline.emit(name, attributes);
  stopDevice = (host.observeDevice?.(report, event) ?? observeBrowser(report)) || undefined;
}

/** Nothing called from SDK code may throw into it: the pipeline fails open, never the Room. */
function quiet<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    diagnose({ error });
    return fallback;
  }
}

function install() {
  if (installed) return;
  installed = true;
  if (pipeline.disabled) return;
  quiet(() => {
    applyHost();
    setLogCapture(onLog);
    pipeline.start();
    if (typeof window !== 'undefined') {
      // The page's last chance; `fetch(keepalive)` makes it best effort.
      window.addEventListener('pagehide', () => pipeline.flush(true).catch(() => {}));
    }
  }, undefined);
}

/** @internal */
export function configureTelemetryHost(next: TelemetryHost) {
  host = next;
  if (pipeline.disabled)
    quiet(() => next.storage?.clear(), undefined); // opted out: nothing cached survives
  else if (installed) quiet(applyHost, undefined);
}

/**
 * Opts this process out of client telemetry. In effect when the call returns: no Room collects
 * anything more, nothing is uploaded, and everything not yet sent is deleted. Not remembered
 * across launches, so call it on every start before the first Room.
 *
 * TODO: final shape pending the token/consent discussion.
 */
export function disableTelemetry(): void {
  // Before the first Room the host's cache (a previous launch's batches) is not installed yet: it
  // is purged all the same.
  if (host.storage) pipeline.storage = host.storage;
  pipeline.disable();
  installed = true;
  quiet(() => {
    stopDevice?.();
    stopDevice = undefined;
    setLogCapture(undefined);
  }, undefined);
}

/** @internal What the SDK calls: every entry point and every object handed out is guarded. */
export const telemetry = {
  pipeline,

  scope(): TelemetryScope {
    install();
    return guarded(new TelemetryScope(pipeline));
  },

  poller(scope: TelemetryScope, source: PeerStatsSource): StatsPoller {
    return guarded(new StatsPoller(scope, pipeline, source));
  },

  bind(owner: object, scope: TelemetryScope) {
    scopes.set(owner, scope);
  },

  scopeOf(owner: object): TelemetryScope | undefined {
    return scopes.get(owner);
  },

  /** What a log context carries for the Room's scope: weak, so a retained context never keeps a Room alive. */
  carrier(scope: TelemetryScope | undefined): WeakRef<TelemetryScope> | undefined {
    return scope && typeof WeakRef !== 'undefined' ? new WeakRef(scope) : undefined;
  },

  /** A getUserMedia / getDisplayMedia failure (SPEC `lk.device.capture.failed`). */
  captureFailed(error: unknown, device: 'camera' | 'microphone' | 'screen_share') {
    quiet(() => {
      const reason = captureFailureReason(error);
      const attributes = { 'lk.device.capture.device': device, 'lk.device.capture.reason': reason };
      pipeline.emit('lk.device.capture.failed', attributes, 'warn');
    }, undefined);
  },
};
