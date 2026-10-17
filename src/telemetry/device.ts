/**
 * Device state and the `lk.device.*` events, cadence factor and holds it drives (SPEC). The pipeline
 * measures nothing itself: a page says whether it is visible and (on Chromium) what it is connected
 * through; React Native reports the rest through the host hook.
 */
import type { Attributes } from './otlp';

export type NetworkType =
  'wifi' | 'cell' | 'wired' | 'vpn' | 'bluetooth' | 'other' | 'unavailable' | 'unknown';

/** @internal What a host reports about the device; every field optional, reported on change. */
export interface DeviceState {
  appState?: 'foreground' | 'background';
  networkType?: NetworkType;
  /** Cellular or a hotspot; Low Data Mode, Data Saver, `navigator.connection.saveData`. */
  networkExpensive?: boolean;
  networkConstrained?: boolean;
  thermal?: 'nominal' | 'fair' | 'serious' | 'critical';
  lowPower?: boolean;
  memory?: 'normal' | 'warning' | 'critical';
  batteryCharge?: number;
  batteryState?: 'charging' | 'discharging';
}

const unplugged = (s: DeviceState) =>
  s.batteryState === 'discharging' && s.batteryCharge !== undefined;

/** SPEC's cadence table; factors multiply, capped at 4×. */
export function cadenceFactor(s: DeviceState): number {
  let factor = 1;
  if (s.appState === 'background') factor *= 2;
  if (s.networkConstrained) factor *= 2;
  if (s.lowPower) factor *= 2;
  factor *= { serious: 2, critical: 4 }[s.thermal as string] ?? 1;
  factor *= { warning: 2, critical: 4 }[s.memory as string] ?? 1;
  if (unplugged(s) && s.batteryCharge! <= 0.2) factor *= 2;
  return Math.min(factor, 4);
}

/** The soft holds a device raises: Low Data Mode / Data Saver, battery at 10 % unplugged. */
export const softHold = (s: DeviceState) =>
  s.networkConstrained === true || (unplugged(s) && s.batteryCharge! <= 0.1);

/** What changed since the last state, as the records SPEC names — one per group, on change only. */
export function changes(prev: DeviceState, next: DeviceState): Array<[string, Attributes]> {
  const out: Array<[string, Attributes]> = [];
  const changed = (...keys: Array<keyof DeviceState>) =>
    keys.some((k) => next[k] !== undefined && next[k] !== prev[k]);
  if (changed('appState')) {
    out.push(['lk.device.app_state.changed', { 'lk.device.app_state': next.appState }]);
  }
  if (changed('networkType', 'networkExpensive', 'networkConstrained')) {
    out.push([
      'lk.device.network.changed',
      {
        'network.connection.type': next.networkType,
        'lk.device.network.expensive': next.networkExpensive,
        'lk.device.network.constrained': next.networkConstrained,
      },
    ]);
  }
  if (changed('thermal')) {
    out.push(['lk.device.thermal.changed', { 'lk.device.thermal.state': next.thermal }]);
  }
  if (changed('lowPower')) {
    out.push(['lk.device.low_power.changed', { 'lk.device.low_power.enabled': next.lowPower }]);
  }
  if (changed('memory')) {
    out.push(['lk.device.memory.changed', { 'lk.device.memory.pressure': next.memory }]);
  }
  // On charging change, and when the level crosses 20 % or 10 % unplugged — never per percent.
  const crossed = (threshold: number) =>
    prev.batteryCharge !== undefined &&
    next.batteryCharge !== undefined &&
    prev.batteryCharge > threshold !== next.batteryCharge > threshold;
  if (
    next.batteryState !== undefined &&
    (changed('batteryState') || (unplugged(next) && (crossed(0.2) || crossed(0.1))))
  ) {
    out.push([
      'lk.device.battery.changed',
      { 'hw.battery.charge': next.batteryCharge, 'hw.battery.state': next.batteryState },
    ]);
  }
  return out;
}

/** `NetworkInformation.type` → SPEC's enum. */
const NETWORK: Record<string, NetworkType> = {
  wifi: 'wifi',
  bluetooth: 'bluetooth',
  other: 'other',
  cellular: 'cell',
  ethernet: 'wired',
  none: 'unavailable',
};

/** Everything a page can answer: visibility, online/offline, and the connection on Chromium. Returns the stop function. */
export function observeBrowser(report: (state: DeviceState) => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const { connection } = navigator as {
    connection?: EventTarget & { type?: string; saveData?: boolean };
  };
  const update = () =>
    report({
      appState: document.visibilityState === 'hidden' ? 'background' : 'foreground',
      networkType:
        navigator.onLine === false ? 'unavailable' : (NETWORK[connection?.type ?? ''] ?? 'unknown'),
      networkExpensive: connection ? connection.type === 'cellular' : undefined,
      networkConstrained: connection ? connection.saveData === true : undefined,
    });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  connection?.addEventListener('change', update);
  update();
  return () => {
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
    connection?.removeEventListener('change', update);
  };
}

/** The getUserMedia failure taxonomy, from a `DOMException` name (SPEC `lk.device.capture.failed`). */
const CAPTURE_REASONS: Record<string, string> = {
  NotAllowedError: 'permission_denied',
  PermissionDeniedError: 'permission_denied',
  SecurityError: 'permission_denied',
  NotFoundError: 'not_found',
  DevicesNotFoundError: 'not_found',
  OverconstrainedError: 'not_found',
  NotReadableError: 'in_use',
  TrackStartError: 'in_use',
  AbortError: 'in_use',
};

export const captureFailureReason = (error: unknown) =>
  (error instanceof Error && CAPTURE_REASONS[error.name]) || 'other';
