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
  private static cache: Map<string, CachedRegionSettings>;

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

  async getNextBestRegionUrl(abortSignal?: AbortSignal) {
    if (!this.isCloud()) {
      throw Error('region availability is only supported for LiveKit Cloud domains');
    }

    let cachedSettings = RegionUrlProvider.cache.get(this.serverUrl.host);

    if (!cachedSettings || Date.now() - cachedSettings.updatedAtInMs > cachedSettings.maxAgeInMs) {
      cachedSettings = await this.fetchRegionSettings(abortSignal);
      RegionUrlProvider.cache.set(this.serverUrl.host, cachedSettings);
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

  /* @internal */
  async fetchRegionSettings(signal?: AbortSignal): Promise<CachedRegionSettings> {
    const regionSettingsResponse = await fetch(`${getCloudConfigUrl(this.serverUrl)}/regions`, {
      headers: { authorization: `Bearer ${this.token}` },
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

  setServerReportedRegions(regionSettings: RegionSettings) {
    RegionUrlProvider.cache.set(this.serverUrl.host, {
      regionSettings,
      updatedAtInMs: Date.now(),
      maxAgeInMs: DEFAULT_MAX_AGE_MS,
    });
  }
}

function getCloudConfigUrl(serverUrl: URL) {
  return `${serverUrl.protocol.replace('ws', 'http')}//${serverUrl.host}/settings`;
}
