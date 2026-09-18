/**
 * Device state, and the cadence factor it drives — but only what a page can answer about itself.
 *
 * The pipeline never measures anything: every value here is the platform saying so. A browser can
 * say whether it is visible and (on Chromium) what it is connected through. It cannot say anything
 * about heat, power or memory pressure, and this package does not pretend otherwise: a platform
 * that knows those reports them to its own backend, not through here.
 */
import type { Attributes } from './otlp';

export type AppStateName = 'foreground' | 'background';
export type NetworkType =
  'wifi' | 'cell' | 'wired' | 'vpn' | 'bluetooth' | 'other' | 'unavailable' | 'unknown';

export interface DeviceState {
  appState?: AppStateName;
  networkType?: NetworkType;
  /** Cellular or hotspot. */
  networkExpensive?: boolean;
  /** Low Data Mode, Data Saver, `navigator.connection.saveData`. */
  networkConstrained?: boolean;
}

/** SPEC's cadence table, for the rows a page can fill in. Factors multiply, capped at 4×. */
const MAX_FACTOR = 4;

export function cadenceFactor(state: DeviceState): number {
  let factor = 1;
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
