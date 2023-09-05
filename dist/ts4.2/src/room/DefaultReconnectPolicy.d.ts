import type { ReconnectContext, ReconnectPolicy } from './ReconnectPolicy';
declare class DefaultReconnectPolicy implements ReconnectPolicy {
    private readonly _retryDelays;
    constructor(retryDelays?: number[]);
    nextRetryDelayInMs(context: ReconnectContext): number | null;
}
export default DefaultReconnectPolicy;
//# sourceMappingURL=DefaultReconnectPolicy.d.ts.map
