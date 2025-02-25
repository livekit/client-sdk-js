import { type CheckInfo, Checker } from './Checker';
export interface ProtocolStats {
    protocol: 'udp' | 'tcp';
    packetsLost: number;
    packetsSent: number;
    qualityLimitationDurations: Record<string, number>;
    rttTotal: number;
    jitterTotal: number;
    bitrateTotal: number;
    count: number;
}
export declare class ConnectionProtocolCheck extends Checker {
    private bestStats?;
    get description(): string;
    perform(): Promise<void>;
    getInfo(): CheckInfo;
    private checkConnectionProtocol;
}
//# sourceMappingURL=connectionProtocol.d.ts.map