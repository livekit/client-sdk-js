import type TypedEmitter from 'typed-emitter';
import type { RoomConnectOptions, RoomOptions } from '../../options';
import type RTCEngine from '../../room/RTCEngine';
import Room from '../../room/Room';
type LogMessage = {
    level: 'info' | 'warning' | 'error';
    message: string;
};
export declare enum CheckStatus {
    IDLE = 0,
    RUNNING = 1,
    SKIPPED = 2,
    SUCCESS = 3,
    FAILED = 4
}
export type CheckInfo = {
    name: string;
    logs: Array<LogMessage>;
    status: CheckStatus;
    description: string;
    data?: any;
};
export interface CheckerOptions {
    errorsAsWarnings?: boolean;
    roomOptions?: RoomOptions;
    connectOptions?: RoomConnectOptions;
    protocol?: 'udp' | 'tcp';
}
declare const Checker_base: new () => TypedEmitter<CheckerCallbacks>;
export declare abstract class Checker extends Checker_base {
    protected url: string;
    protected token: string;
    room: Room;
    connectOptions?: RoomConnectOptions;
    status: CheckStatus;
    logs: Array<LogMessage>;
    name: string;
    options: CheckerOptions;
    constructor(url: string, token: string, options?: CheckerOptions);
    abstract get description(): string;
    protected abstract perform(): Promise<void>;
    run(onComplete?: () => void): Promise<CheckInfo>;
    protected isSuccess(): boolean;
    protected connect(url?: string): Promise<Room>;
    protected disconnect(): Promise<void>;
    protected skip(): void;
    protected switchProtocol(protocol: 'udp' | 'tcp' | 'tls'): Promise<void>;
    protected appendMessage(message: string): void;
    protected appendWarning(message: string): void;
    protected appendError(message: string): void;
    protected setStatus(status: CheckStatus): void;
    protected get engine(): RTCEngine | undefined;
    getInfo(): CheckInfo;
}
export type InstantiableCheck<T extends Checker> = {
    new (url: string, token: string, options?: CheckerOptions): T;
};
type CheckerCallbacks = {
    update: (info: CheckInfo) => void;
};
export {};
//# sourceMappingURL=Checker.d.ts.map