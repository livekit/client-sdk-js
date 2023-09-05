import type { RegionSettings } from '../proto/livekit_rtc_pb';
export declare class RegionUrlProvider {
    private serverUrl;
    private token;
    private regionSettings;
    private lastUpdateAt;
    private settingsCacheTime;
    private attemptedRegions;
    constructor(url: string, token: string);
    updateToken(token: string): void;
    isCloud(): boolean;
    getServerUrl(): URL;
    getNextBestRegionUrl(abortSignal?: AbortSignal): Promise<string | null>;
    resetAttempts(): void;
    fetchRegionSettings(signal?: AbortSignal): Promise<RegionSettings>;
}
//# sourceMappingURL=RegionUrlProvider.d.ts.map
