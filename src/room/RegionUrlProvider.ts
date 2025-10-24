import type { RegionInfo, RegionSettings } from '@livekit/protocol';
import log from '../logger';
import { ConnectionError, ConnectionErrorReason } from './errors';
import { extractMaxAgeFromRequestHeaders, isCloud } from './utils';

const DEFAULT_MAX_AGE_MS = 5_000;

type CachedRegionSettings = {
  regionSettings: RegionSettings;
  updatedAtInMs: number;
  maxAgeInMs: number;
};

export class RegionUrlProvider {
  private static readonly cache: Map<string, CachedRegionSettings> = new Map();

  private static settingsTimeout: ReturnType<typeof setTimeout>;

  private static scheduleRefetch(url: URL, token: string, maxAgeInMs: number) {
    clearTimeout(this.settingsTimeout);
    RegionUrlProvider.settingsTimeout = setTimeout(async () => {
      try {
        const newSettings = await fetchRegionSettings(url, token);
        RegionUrlProvider.updateCachedRegionSettings(url, token, newSettings);
      } catch (error: unknown) {
        log.debug('auto refetching of region settings failed', { error });
        // continue retrying with the same max age
        RegionUrlProvider.scheduleRefetch(url, token, maxAgeInMs);
      }
    }, maxAgeInMs);
  }

  private static updateCachedRegionSettings(
    url: URL,
    token: string,
    settings: CachedRegionSettings,
  ) {
    RegionUrlProvider.cache.set(url.hostname, settings);
    RegionUrlProvider.scheduleRefetch(url, token, settings.maxAgeInMs);
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
    return fetchRegionSettings(this.serverUrl, this.token, abortSignal);
  }

  async getNextBestRegionUrl(abortSignal?: AbortSignal) {
    if (!this.isCloud()) {
      throw Error('region availability is only supported for LiveKit Cloud domains');
    }

    let cachedSettings = RegionUrlProvider.cache.get(this.serverUrl.hostname);

    if (!cachedSettings || Date.now() - cachedSettings.updatedAtInMs > cachedSettings.maxAgeInMs) {
      cachedSettings = await this.fetchRegionSettings(abortSignal);
      RegionUrlProvider.updateCachedRegionSettings(this.serverUrl, this.token, cachedSettings);
    }

    const regionsLeft = cachedSettings.regionSettings.regions.filter(
      (region) => !this.attemptedRegions.find((attempted) => attempted.url === region.url),
    );
    if (regionsLeft.length > 0) {
      const nextRegion = regionsLeft[0];
      this.attemptedRegions.push(nextRegion);
      log.debug(`next region: ${nextRegion.region}`);
      return nextRegion.url;
    } else {
      return null;
    }
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

async function fetchRegionSettings(
  serverUrl: URL,
  token: string,
  signal?: AbortSignal,
): Promise<CachedRegionSettings> {
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
    throw new ConnectionError(
      `Could not fetch region settings: ${regionSettingsResponse.statusText}`,
      regionSettingsResponse.status === 401
        ? ConnectionErrorReason.NotAllowed
        : ConnectionErrorReason.InternalError,
      regionSettingsResponse.status,
    );
  }
}
