import { ParticipantInfo, ReconnectReason, Room, SpeakerInfo, VideoLayer } from '../proto/livekit_models_pb';
import { AddTrackRequest, ConnectionQualityUpdate, JoinResponse, LeaveRequest, ReconnectResponse, SessionDescription, SignalRequest, SignalTarget, SimulateScenario, StreamStateUpdate, SubscribedQualityUpdate, SubscriptionPermissionUpdate, SubscriptionResponse, SyncState, TrackPermission, TrackPublishedResponse, TrackUnpublishedResponse, UpdateSubscription, UpdateTrackSettings } from '../proto/livekit_rtc_pb';
import { AsyncQueue } from '../utils/AsyncQueue';
interface ConnectOpts extends SignalOptions {
    /** internal */
    reconnect?: boolean;
    /** internal */
    reconnectReason?: number;
    /** internal */
    sid?: string;
}
export interface SignalOptions {
    autoSubscribe: boolean;
    /** @deprecated */
    publishOnly?: string;
    adaptiveStream?: boolean;
    maxRetries: number;
    e2eeEnabled: boolean;
    websocketTimeout: number;
}
type SignalMessage = SignalRequest['message'];
/** @internal */
export declare class SignalClient {
    isConnected: boolean;
    isReconnecting: boolean;
    requestQueue: AsyncQueue;
    queuedRequests: Array<() => Promise<void>>;
    useJSON: boolean;
    /** signal rtt in milliseconds */
    rtt: number;
    /** simulate signaling latency by delaying messages */
    signalLatency?: number;
    onClose?: (reason: string) => void;
    onAnswer?: (sd: RTCSessionDescriptionInit) => void;
    onOffer?: (sd: RTCSessionDescriptionInit) => void;
    onTrickle?: (sd: RTCIceCandidateInit, target: SignalTarget) => void;
    onParticipantUpdate?: (updates: ParticipantInfo[]) => void;
    onLocalTrackPublished?: (res: TrackPublishedResponse) => void;
    onNegotiateRequested?: () => void;
    onSpeakersChanged?: (res: SpeakerInfo[]) => void;
    onRemoteMuteChanged?: (trackSid: string, muted: boolean) => void;
    onRoomUpdate?: (room: Room) => void;
    onConnectionQuality?: (update: ConnectionQualityUpdate) => void;
    onStreamStateUpdate?: (update: StreamStateUpdate) => void;
    onSubscribedQualityUpdate?: (update: SubscribedQualityUpdate) => void;
    onSubscriptionPermissionUpdate?: (update: SubscriptionPermissionUpdate) => void;
    onSubscriptionError?: (update: SubscriptionResponse) => void;
    onLocalTrackUnpublished?: (res: TrackUnpublishedResponse) => void;
    onTokenRefresh?: (token: string) => void;
    onLeave?: (leave: LeaveRequest) => void;
    connectOptions?: ConnectOpts;
    ws?: WebSocket;
    private options?;
    private pingTimeout;
    private pingTimeoutDuration;
    private pingIntervalDuration;
    private pingInterval;
    private closingLock;
    constructor(useJSON?: boolean);
    join(url: string, token: string, opts: SignalOptions, abortSignal?: AbortSignal): Promise<JoinResponse>;
    reconnect(url: string, token: string, sid?: string, reason?: ReconnectReason): Promise<ReconnectResponse | void>;
    private connect;
    /** @internal */
    resetCallbacks: () => void;
    close(): Promise<void>;
    sendOffer(offer: RTCSessionDescriptionInit): void;
    sendAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
    sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget): Promise<void>;
    sendMuteTrack(trackSid: string, muted: boolean): Promise<void>;
    sendAddTrack(req: AddTrackRequest): Promise<void>;
    sendUpdateLocalMetadata(metadata: string, name: string): Promise<void>;
    sendUpdateTrackSettings(settings: UpdateTrackSettings): void;
    sendUpdateSubscription(sub: UpdateSubscription): Promise<void>;
    sendSyncState(sync: SyncState): Promise<void>;
    sendUpdateVideoLayers(trackSid: string, layers: VideoLayer[]): Promise<void>;
    sendUpdateSubscriptionPermissions(allParticipants: boolean, trackPermissions: TrackPermission[]): Promise<void>;
    sendSimulateScenario(scenario: SimulateScenario): Promise<void>;
    sendPing(): Promise<[
        void,
        void
    ]>;
    sendLeave(): Promise<void>;
    sendRequest(message: SignalMessage, fromQueue?: boolean): Promise<void>;
    private handleSignalResponse;
    setReconnected(): void;
    private handleOnClose;
    private handleWSError;
    /**
     * Resets the ping timeout and starts a new timeout.
     * Call this after receiving a pong message
     */
    private resetPingTimeout;
    /**
     * Clears ping timeout (does not start a new timeout)
     */
    private clearPingTimeout;
    private startPingInterval;
    private clearPingInterval;
}
export declare function toProtoSessionDescription(rsd: RTCSessionDescription | RTCSessionDescriptionInit): SessionDescription;
export {};
//# sourceMappingURL=SignalClient.d.ts.map
