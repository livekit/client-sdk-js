/**
 * Device state: the events SPEC calls `lk.device.*`, and the cadence factor they drive. The
 * pipeline never measures anything itself — measuring CPU costs CPU — so every value here comes
 * from the platform saying so: the browser's own APIs, or React Native's native module.
 *
 * A browser can only answer some of this. `visibilitychange` is universal, `navigator.connection`
 * is Chromium, and thermal, low power and memory pressure have no web API at all — a page simply
 * never reports them, and its cadence factor stays at whatever the rest implies.
 */
import type { Attributes } from './otlp';

export type AppStateName = 'foreground' | 'background';
export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';
export type MemoryPressure = 'normal' | 'warning' | 'critical';
export type NetworkType =
  'wifi' | 'cell' | 'wired' | 'vpn' | 'bluetooth' | 'other' | 'unavailable' | 'unknown';

export interface DeviceState {
  appState?: AppStateName;
  thermal?: ThermalState;
  memory?: MemoryPressure;
  lowPower?: boolean;
  networkType?: NetworkType;
  /** Cellular or hotspot. */
  networkExpensive?: boolean;
  /** Low Data Mode, Data Saver, `navigator.connection.saveData`. */
  networkConstrained?: boolean;
}

/** SPEC's cadence table. Factors multiply and the product is capped at 4×. */
const THERMAL_FACTOR: Record<ThermalState, number> = {
  nominal: 1,
  fair: 1,
  serious: 2,
  critical: 4,
};
const MEMORY_FACTOR: Record<MemoryPressure, number> = { normal: 1, warning: 2, critical: 4 };
const MAX_FACTOR = 4;

export function cadenceFactor(state: DeviceState): number {
  let factor = 1;
  if (state.thermal) factor *= THERMAL_FACTOR[state.thermal];
  if (state.memory) factor *= MEMORY_FACTOR[state.memory];
  if (state.lowPower) factor *= 2;
  if (state.appState === 'background') factor *= 2;
  if (state.networkConstrained) factor *= 2;
  return Math.min(factor, MAX_FACTOR);
}

/** `NetworkInformation.type` → SPEC's enum. */
export function networkType(type: string | undefined): NetworkType {
  switch (type) {
    case 'wifi':
    case 'bluetooth':
      return type;
    case 'cellular':
      return 'cell';
    case 'ethernet':
      return 'wired';
    case 'none':
      return 'unavailable';
    case 'wimax':
    case 'mixed':
    case 'other':
      return 'other';
    default:
      return 'unknown';
  }
}

interface Change {
  event: string;
  attributes: Attributes;
}

/** What changed since the last update, as the records SPEC names — one per group, on change only. */
export function changes(previous: DeviceState, next: DeviceState): Change[] {
  const out: Change[] = [];
  if (next.appState !== undefined && next.appState !== previous.appState) {
    out.push({
      event: 'lk.device.app_state.changed',
      attributes: { 'lk.device.app_state': next.appState },
    });
  }
  if (next.thermal !== undefined && next.thermal !== previous.thermal) {
    out.push({
      event: 'lk.device.thermal.changed',
      attributes: { 'lk.device.thermal.state': next.thermal },
    });
  }
  if (next.memory !== undefined && next.memory !== previous.memory) {
    out.push({
      event: 'lk.device.memory.changed',
      attributes: { 'lk.device.memory.pressure': next.memory },
    });
  }
  if (next.lowPower !== undefined && next.lowPower !== previous.lowPower) {
    out.push({
      event: 'lk.device.low_power.changed',
      attributes: { 'lk.device.low_power.enabled': next.lowPower },
    });
  }
  const networkChanged =
    (next.networkType !== undefined && next.networkType !== previous.networkType) ||
    (next.networkExpensive !== undefined && next.networkExpensive !== previous.networkExpensive) ||
    (next.networkConstrained !== undefined &&
      next.networkConstrained !== previous.networkConstrained);
  if (networkChanged) {
    out.push({
      event: 'lk.device.network.changed',
      attributes: {
        'network.connection.type': next.networkType ?? previous.networkType,
        'lk.device.network.expensive': next.networkExpensive ?? previous.networkExpensive,
        'lk.device.network.constrained': next.networkConstrained ?? previous.networkConstrained,
      },
    });
  }
  return out;
}

/** Everything a page can answer: the tab's visibility everywhere, the connection on Chromium. */
export function observeBrowser(report: (state: DeviceState) => void): void {
  if (typeof document !== 'undefined') {
    const visibility = () =>
      report({ appState: document.visibilityState === 'hidden' ? 'background' : 'foreground' });
    document.addEventListener('visibilitychange', visibility);
    visibility();
  }
  const connection = (globalThis.navigator as { connection?: NetworkInformationLike } | undefined)
    ?.connection;
  if (connection) {
    const network = () =>
      report({
        networkType: networkType(connection.type),
        networkExpensive: connection.type === 'cellular',
        networkConstrained: connection.saveData === true,
      });
    connection.addEventListener?.('change', network);
    network();
  }
}

interface NetworkInformationLike {
  type?: string;
  saveData?: boolean;
  addEventListener?: (event: 'change', listener: () => void) => void;
}
