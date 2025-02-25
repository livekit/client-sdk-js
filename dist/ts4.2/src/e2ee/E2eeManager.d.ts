import type TypedEventEmitter from 'typed-emitter';
import type RTCEngine from '../room/RTCEngine';
import type Room from '../room/Room';
import type { E2EEManagerCallbacks } from './events';
import type { E2EEManagerOptions } from './types';
export interface BaseE2EEManager {
    setup(room: Room): void;
    setupEngine(engine: RTCEngine): void;
    setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void;
    setSifTrailer(trailer: Uint8Array): void;
    on<E extends keyof E2EEManagerCallbacks>(event: E, listener: E2EEManagerCallbacks[E]): this;
}
declare const E2EEManager_base: new () => TypedEventEmitter<E2EEManagerCallbacks>;
/**
 * @experimental
 */
export declare class E2EEManager extends E2EEManager_base implements BaseE2EEManager {
    protected worker: Worker;
    protected room?: Room;
    private encryptionEnabled;
    private keyProvider;
    constructor(options: E2EEManagerOptions);
    /**
     * @internal
     */
    setup(room: Room): void;
    /**
     * @internal
     */
    setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void;
    /**
     * @internal
     */
    setSifTrailer(trailer: Uint8Array): void;
    private onWorkerMessage;
    private onWorkerError;
    setupEngine(engine: RTCEngine): void;
    private setupEventListeners;
    private postRatchetRequest;
    private postKey;
    private postEnable;
    private postRTPMap;
    private postSifTrailer;
    private setupE2EEReceiver;
    private setupE2EESender;
    /**
     * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
     * a frame decoder.
     *
     */
    private handleReceiver;
    /**
     * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
     * a frame encoder.
     *
     */
    private handleSender;
}
export {};
//# sourceMappingURL=E2eeManager.d.ts.map
