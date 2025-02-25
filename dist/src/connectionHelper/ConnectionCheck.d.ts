import type TypedEmitter from 'typed-emitter';
import type { CheckInfo, CheckerOptions, InstantiableCheck } from './checks/Checker';
import { CheckStatus, Checker } from './checks/Checker';
export type { CheckInfo, CheckStatus };
declare const ConnectionCheck_base: new () => TypedEmitter<ConnectionCheckCallbacks>;
export declare class ConnectionCheck extends ConnectionCheck_base {
    token: string;
    url: string;
    options: CheckerOptions;
    private checkResults;
    constructor(url: string, token: string, options?: CheckerOptions);
    private getNextCheckId;
    private updateCheck;
    isSuccess(): boolean;
    getResults(): CheckInfo[];
    createAndRunCheck<T extends Checker>(check: InstantiableCheck<T>): Promise<CheckInfo>;
    checkWebsocket(): Promise<CheckInfo>;
    checkWebRTC(): Promise<CheckInfo>;
    checkTURN(): Promise<CheckInfo>;
    checkReconnect(): Promise<CheckInfo>;
    checkPublishAudio(): Promise<CheckInfo>;
    checkPublishVideo(): Promise<CheckInfo>;
    checkConnectionProtocol(): Promise<CheckInfo>;
    checkCloudRegion(): Promise<CheckInfo>;
}
type ConnectionCheckCallbacks = {
    checkUpdate: (id: number, info: CheckInfo) => void;
};
//# sourceMappingURL=ConnectionCheck.d.ts.map