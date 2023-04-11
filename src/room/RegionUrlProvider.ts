import type { RegionInfo, RegionSettings } from '../proto/livekit_rtc';
import { ConnectionError } from './errors';
import log from '../logger';

export class RegionUrlProvider {
  private serverUrl: URL;

  private token: string;

  private regionSettings: RegionSettings | undefined;

  private lastUpdateAt: number = 0;

  private settingsCacheTime = 3_000;

  private attemptedRegions: RegionInfo[] = [];

  constructor(url: string, token: string) {
    this.serverUrl = new URL(url);
    this.token = token;
  }

  isCloud() {
    return isCloud(this.serverUrl);
  }

  async getNextBestRegionUrl(abortSignal?: AbortSignal) {
    if (!this.isCloud()) {
      throw Error('region availability is only supported for livekit cloud domains');
    }
    if (!this.regionSettings || Date.now() - this.lastUpdateAt > this.settingsCacheTime) {
      this.regionSettings = await this.fetchRegionSettings(abortSignal);
    }
    const regionsLeft = this.regionSettings.regions.filter(
      (region) => !this.attemptedRegions.find((attempted) => attempted.url === region.url),
    );
    if (regionsLeft.length > 0) {
      const nextRegion = regionsLeft[0];
      this.attemptedRegions.push(nextRegion);
      log.debug(`trying to connect to region: ${nextRegion.region}`);
      return nextRegion.url;
    } else {
      return null;
    }
  }

  resetAttempts() {
    this.attemptedRegions = [];
  }

  private async fetchRegionSettings(signal?: AbortSignal) {
    const regionSettingsResponse = await fetch(`${getCloudConfigUrl(this.serverUrl)}/regions`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal,
    });
    if (regionSettingsResponse.ok) {
      const regionSettings = (await regionSettingsResponse.json()) as RegionSettings;
      this.lastUpdateAt = Date.now();
      return regionSettings;
    } else {
      throw new ConnectionError(
        `Could not fetch region settings: ${regionSettingsResponse.statusText}`,
        undefined,
        regionSettingsResponse.status,
      );
    }
  }
}

export function isCloud(serverUrl: URL) {
  return serverUrl.hostname.endsWith('.livekit.cloud');
}

function getCloudConfigUrl(serverUrl: URL) {
  // TODO REMOVE DEBUG
  return `${serverUrl.protocol.replace('ws', 'http')}//${serverUrl.host}/settings`;

  return serverUrl.host.replace('.', '.config.');
}
