import type { RegionSettings } from '../../proto/livekit_rtc';
import { ConnectionError } from '../errors';

export class RegionUrlProvider {
  serverUrl: URL;

  regionSettings: RegionSettings | undefined;

  lastUpdateAt: number = 0;

  settingsCacheTime = 3_000;

  constructor(url: string) {
    this.serverUrl = new URL(url);
  }

  isCloud() {
    return isCloud(this.serverUrl);
  }

  async fetchRegionSettings() {
    if (this.isCloud()) {
      const regionSettingsResponse = await fetch(getCloudConfigUrl(this.serverUrl));
      if (regionSettingsResponse.ok) {
        this.regionSettings = (await regionSettingsResponse.json()) as RegionSettings;
        this.lastUpdateAt = Date.now();
        return this.regionSettings;
      } else {
        throw new ConnectionError(
          `Could not fetch region settings: ${regionSettingsResponse.statusText}`,
          undefined,
          regionSettingsResponse.status,
        );
      }
    }
  }

  async getNextBestRegionUrl() {
    if (Date.now() - this.lastUpdateAt > this.settingsCacheTime) {
      await this.fetchRegionSettings();
    }
  }
}

function isCloud(serverUrl: URL) {
  return serverUrl.hostname.endsWith('.livekit.cloud');
}

function getCloudConfigUrl(serverUrl: URL) {
  const urlParts = serverUrl.hostname.split('.');
  const subdomain = urlParts[0];
  const isStaging = urlParts[1] === 'staging';
  if (isStaging) {
    return `https://${subdomain}.config.staging.livekit.cloud`;
  } else {
    return `https://${subdomain}.config.livekit.cloud`;
  }
}
