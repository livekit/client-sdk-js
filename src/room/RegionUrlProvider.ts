import { Mutex } from '@livekit/mutex';
import { ResultAsync, errAsync, okAsync, safeTry } from 'neverthrow';
import type { RegionInfo, RegionSettings } from '@livekit/protocol';
import log from '../logger';
import { ConnectionError, ConnectionErrorReason } from './errors';
import { extractMaxAgeFromRequestHeaders, isCloud } from './utils';

export const DEFAULT_MAX_AGE_MS = 5_000;
export const STOP_REFETCH_DELAY_MS = 30_000;

type CachedRegionSettings = {
  regionSettings: RegionSettings;
  updatedAtInMs: number;
  maxAgeInMs: number;
};

type ConnectionTracker = {
  connectionCount: number;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

export class RegionUrlProvider {
  private static readonly cache: Map<string, CachedRegionSettings> = new Map();

  private static settingsTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private static connectionTrackers: Map<string, ConnectionTracker> = new Map();

  private static fetchLock = new Mutex();

  private static async fetchRegionSettings(
    serverUrl: URL,
    token: string,
    signal?: AbortSignal,
  ): Promise<CachedRegionSettings> {
    const unlock = await RegionUrlProvider.fetchLock.lock();
    try {
      const regionSettingsResponse = await fetch(`${getCloudConfigUrl(serverUrl)}/regions`, {
        headers: { authorization: `Bearer ${token}` },
        signal,
      });
      if (regionSettingsResponse.ok) {
        const maxAge = extractMaxAgeFromRequestHeaders(regionSettingsResponse.headers);
        const maxAgeInMs = maxAge ? maxAge * 1000 : DEFAULT_MAX_AGE_MS;

        const regionSettings = (await regionSettingsResponse.json()) as RegionSettings;
        return { regionSettings, updatedAtInMs: Date.now(), maxAgeInMs };
      } else {
        throw regionSettingsResponse.status === 401
          ? ConnectionError.notAllowed(
              `Could not fetch region settings: ${regionSettingsResponse.statusText}`,
              regionSettingsResponse.status,
            )
          : ConnectionError.internal(
              `Could not fetch region settings: ${regionSettingsResponse.statusText}`,
              { status: regionSettingsResponse.status },
            );
      }
    } catch (e: unknown) {
      if (e instanceof ConnectionError) {
        // rethrow connection errors
        throw e;
      } else if (signal?.aborted) {
        throw ConnectionError.cancelled(`Region fetching was aborted`);
      } else {
        // wrap other errors as connection errors (e.g. timeouts)
        throw ConnectionError.serverUnreachable(
          `Could not fetch region settings, ${e instanceof Error ? `${e.name}: ${e.message}` : e}`,
          500, // using 500 as a catch-all manually set error code here
        );
      }
    } finally {
      unlock();
    }
  }

  private static async scheduleRefetch(url: URL, token: string, maxAgeInMs: number) {
    const timeout = RegionUrlProvider.settingsTimeouts.get(url.hostname);
    clearTimeout(timeout);
    RegionUrlProvider.settingsTimeouts.set(
      url.hostname,
      setTimeout(async () => {
        try {
          const newSettings = await RegionUrlProvider.fetchRegionSettings(url, token);
          RegionUrlProvider.updateCachedRegionSettings(url, token, newSettings);
        } catch (error: unknown) {
          if (
            error instanceof ConnectionError &&
            error.reason === ConnectionErrorReason.NotAllowed
          ) {
            log.debug('token is not valid, cancelling auto region refresh');
            return;
          }
          log.debug('auto refetching of region settings failed', { error });
          // continue retrying with the same max age
          RegionUrlProvider.scheduleRefetch(url, token, maxAgeInMs);
        }
      }, maxAgeInMs),
    );
  }

  private static updateCachedRegionSettings(
    url: URL,
    token: string,
    settings: CachedRegionSettings,
  ) {
    RegionUrlProvider.cache.set(url.hostname, settings);
    RegionUrlProvider.scheduleRefetch(url, token, settings.maxAgeInMs);
  }

  private static stopRefetch(hostname: string) {
    const timeout = RegionUrlProvider.settingsTimeouts.get(hostname);
    if (timeout) {
      clearTimeout(timeout);
      RegionUrlProvider.settingsTimeouts.delete(hostname);
    }
  }

  private static scheduleCleanup(hostname: string) {
    let tracker = RegionUrlProvider.connectionTrackers.get(hostname);
    if (!tracker) {
      return;
    }

    // Cancel any existing cleanup timeout
    if (tracker.cleanupTimeout) {
      clearTimeout(tracker.cleanupTimeout);
    }

    // Schedule cleanup to stop refetch after delay
    tracker.cleanupTimeout = setTimeout(() => {
      const currentTracker = RegionUrlProvider.connectionTrackers.get(hostname);
      if (currentTracker && currentTracker.connectionCount === 0) {
        log.debug('stopping region refetch after disconnect delay', { hostname });
        RegionUrlProvider.stopRefetch(hostname);
      }
      if (currentTracker) {
        currentTracker.cleanupTimeout = undefined;
      }
    }, STOP_REFETCH_DELAY_MS);
  }

  private static cancelCleanup(hostname: string) {
    const tracker = RegionUrlProvider.connectionTrackers.get(hostname);
    if (tracker?.cleanupTimeout) {
      clearTimeout(tracker.cleanupTimeout);
      tracker.cleanupTimeout = undefined;
    }
  }

  notifyConnected() {
    const hostname = this.serverUrl.hostname;
    let tracker = RegionUrlProvider.connectionTrackers.get(hostname);
    if (!tracker) {
      tracker = { connectionCount: 0 };
      RegionUrlProvider.connectionTrackers.set(hostname, tracker);
    }

    tracker.connectionCount++;

    // Cancel any scheduled cleanup since we have an active connection
    RegionUrlProvider.cancelCleanup(hostname);
  }

  notifyDisconnected() {
    const hostname = this.serverUrl.hostname;
    const tracker = RegionUrlProvider.connectionTrackers.get(hostname);
    if (!tracker) {
      return;
    }

    tracker.connectionCount = Math.max(0, tracker.connectionCount - 1);

    // If no more connections, schedule cleanup
    if (tracker.connectionCount === 0) {
      RegionUrlProvider.scheduleCleanup(hostname);
    }
  }

  private serverUrl: URL;

  private token: string;

  private attemptedRegions: RegionInfo[] = [];

  constructor(url: string, token: string) {
    this.serverUrl = new URL(url);
    this.token = token;
  }

  updateToken(token: string) {
    this.token = token;
  }

  isCloud() {
    return isCloud(this.serverUrl);
  }

  getServerUrl() {
    return this.serverUrl;
  }

  /** @internal */
  async fetchRegionSettings(abortSignal?: AbortSignal): Promise<CachedRegionSettings> {
    return RegionUrlProvider.fetchRegionSettings(this.serverUrl, this.token, abortSignal);
  }

  getNextBestRegionUrl(abortSignal?: AbortSignal): ResultAsync<string | null, ConnectionError> {
    if (!this.isCloud()) {
      return errAsync(
        ConnectionError.internal('region availability is only supported for LiveKit Cloud domains'),
      );
    }

    let cachedSettings = RegionUrlProvider.cache.get(this.serverUrl.hostname);

    const self = this;
    return safeTry(async function* () {
      if (
        !cachedSettings ||
        Date.now() - cachedSettings.updatedAtInMs > cachedSettings.maxAgeInMs
      ) {
        const settingsResult = ResultAsync.fromPromise(
          self.fetchRegionSettings(abortSignal),
          (e) => e as ConnectionError,
        );

        cachedSettings = yield* settingsResult;
        RegionUrlProvider.updateCachedRegionSettings(self.serverUrl, self.token, cachedSettings);
      }

      if (!cachedSettings) {
        return okAsync(null);
      }

      const regionsLeft = cachedSettings.regionSettings.regions.filter(
        (region) => !self.attemptedRegions.find((attempted) => attempted.url === region.url),
      );
      if (regionsLeft.length > 0) {
        const nextRegion = regionsLeft[0];
        self.attemptedRegions.push(nextRegion);
        log.debug(`next region: ${nextRegion.region}`);
        return okAsync(nextRegion.url);
      } else {
        return okAsync(null);
      }
    });
  }

  resetAttempts() {
    this.attemptedRegions = [];
  }

  setServerReportedRegions(settings: CachedRegionSettings) {
    RegionUrlProvider.updateCachedRegionSettings(this.serverUrl, this.token, settings);
  }
}

function getCloudConfigUrl(serverUrl: URL) {
  return `${serverUrl.protocol.replace('ws', 'http')}//${serverUrl.host}/settings`;
}
