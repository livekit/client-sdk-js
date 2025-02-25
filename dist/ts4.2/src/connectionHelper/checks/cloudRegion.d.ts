import type { CheckInfo } from './Checker';
import { Checker } from './Checker';
export interface RegionStats {
    region: string;
    rtt: number;
    duration: number;
}
/**
 * Checks for connections quality to closests Cloud regions and determining the best quality
 */
export declare class CloudRegionCheck extends Checker {
    private bestStats?;
    get description(): string;
    perform(): Promise<void>;
    getInfo(): CheckInfo;
    private checkCloudRegion;
}
//# sourceMappingURL=cloudRegion.d.ts.map
