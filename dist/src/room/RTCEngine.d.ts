import { type AddTrackRequest, type ConnectionQualityUpdate, DataPacket, DataPacket_Kind, DisconnectReason, type JoinResponse, ParticipantInfo, RequestResponse, Room as RoomModel, SpeakerInfo, type StreamStateUpdate, SubscribedQualityUpdate, type SubscriptionPermissionUpdate, type SubscriptionResponse, TrackInfo, TrackUnpublishedResponse, Transcription } from '@livekit/protocol';
import type TypedEventEmitter from 'typed-emitter';
import type { SignalOptions } from '../api/SignalClient';
import { SignalClient } from '../api/SignalClient';
import type { InternalRoomOptions } from '../options';
import PCTransport from './PCTransport';
import { PCTransportManager } from './PCTransportManager';
import type { RegionUrlProvider } from './RegionUrlProvider';
import { RpcError } from './rpc';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import LocalVideoTrack from './track/LocalVideoTrack';
import type { SimulcastTrackInfo } from './track/LocalVideoTrack';
import type RemoteTrackPublication from './track/RemoteTrackPublication';
import type { Track } from './track/Track';
import type { TrackPublishOptions, VideoCodec } from './track/options';
declare const RTCEngine_base: new () => TypedEventEmitter<EngineEventCallbacks>;
/** @internal */
export default class RTCEngine extends RTCEngine_base {
    private options;
    client: SignalClient;
    rtcConfig: RTCConfiguration;
    peerConnectionTimeout: number;
    fullReconnectOnNext: boolean;
    pcManager?: PCTransportManager;
    /**
     * @internal
     */
    latestJoinResponse?: JoinResponse;
    get isClosed(): boolean;
    get pendingReconnect(): boolean;
    private lossyDC?;
    private lossyDCSub?;
    private reliableDC?;
    private dcBufferStatus;
    private reliableDCSub?;
    private subscriberPrimary;
    private pcState;
    private _isClosed;
    private pendingTrackResolvers;
    private url?;
    private token?;
    private signalOpts?;
    private reconnectAttempts;
    private reconnectStart;
    private clientConfiguration?;
    private attemptingReconnect;
    private reconnectPolicy;
    private reconnectTimeout?;
    private participantSid?;
    /** keeps track of how often an initial join connection has been tried */
    private joinAttempts;
    /** specifies how often an initial join connection is allowed to retry */
    private maxJoinAttempts;
    private closingLock;
    private dataProcessLock;
    private shouldFailNext;
    private regionUrlProvider?;
    private log;
    private loggerOptions;
    private publisherConnectionPromise;
    constructor(options: InternalRoomOptions);
    /** @internal */
    get logContext(): {
        room: string | undefined;
        roomID: string | undefined;
        participant: string | undefined;
        pID: string | undefined;
    };
    join(url: string, token: string, opts: SignalOptions, abortSignal?: AbortSignal): Promise<JoinResponse>;
    close(): Promise<void>;
    cleanupPeerConnections(): Promise<void>;
    cleanupClient(): Promise<void>;
    addTrack(req: AddTrackRequest): Promise<TrackInfo>;
    /**
     * Removes sender from PeerConnection, returning true if it was removed successfully
     * and a negotiation is necessary
     * @param sender
     * @returns
     */
    removeTrack(sender: RTCRtpSender): boolean;
    updateMuteStatus(trackSid: string, muted: boolean): void;
    get dataSubscriberReadyState(): string | undefined;
    getConnectedServerAddress(): Promise<string | undefined>;
    setRegionUrlProvider(provider: RegionUrlProvider): void;
    private configure;
    private setupSignalClientCallbacks;
    private makeRTCConfiguration;
    private createDataChannels;
    private handleDataChannel;
    private handleDataMessage;
    private handleDataError;
    private handleBufferedAmountLow;
    createSender(track: LocalTrack, opts: TrackPublishOptions, encodings?: RTCRtpEncodingParameters[]): Promise<RTCRtpSender>;
    createSimulcastSender(track: LocalVideoTrack, simulcastTrack: SimulcastTrackInfo, opts: TrackPublishOptions, encodings?: RTCRtpEncodingParameters[]): Promise<RTCRtpSender | undefined>;
    private createTransceiverRTCRtpSender;
    private createSimulcastTransceiverSender;
    private createRTCRtpSender;
    private handleDisconnect;
    private attemptReconnect;
    private getNextRetryDelay;
    private restartConnection;
    private resumeConnection;
    waitForPCInitialConnection(timeout?: number, abortController?: AbortController): Promise<void>;
    private waitForPCReconnected;
    waitForRestarted: () => Promise<void>;
    /** @internal */
    publishRpcResponse(destinationIdentity: string, requestId: string, payload: string | null, error: RpcError | null): Promise<void>;
    /** @internal */
    publishRpcAck(destinationIdentity: string, requestId: string): Promise<void>;
    sendDataPacket(packet: DataPacket, kind: DataPacket_Kind): Promise<void>;
    private updateAndEmitDCBufferStatus;
    private isBufferStatusLow;
    waitForBufferStatusLow(kind: DataPacket_Kind): Promise<void>;
    /**
     * @internal
     */
    ensureDataTransportConnected(kind: DataPacket_Kind, subscriber?: boolean): Promise<void>;
    private ensurePublisherConnected;
    verifyTransport(): boolean;
    /** @internal */
    negotiate(): Promise<void>;
    dataChannelForKind(kind: DataPacket_Kind, sub?: boolean): RTCDataChannel | undefined;
    /** @internal */
    sendSyncState(remoteTracks: RemoteTrackPublication[], localTracks: LocalTrackPublication[]): void;
    failNext(): void;
    private dataChannelsInfo;
    private clearReconnectTimeout;
    private clearPendingReconnect;
    private handleBrowserOnLine;
    private registerOnLineListener;
    private deregisterOnLineListener;
}
export type EngineEventCallbacks = {
    connected: (joinResp: JoinResponse) => void;
    disconnected: (reason?: DisconnectReason) => void;
    resuming: () => void;
    resumed: () => void;
    restarting: () => void;
    restarted: () => void;
    signalResumed: () => void;
    signalRestarted: (joinResp: JoinResponse) => void;
    closing: () => void;
    mediaTrackAdded: (track: MediaStreamTrack, streams: MediaStream, receiver: RTCRtpReceiver) => void;
    activeSpeakersUpdate: (speakers: Array<SpeakerInfo>) => void;
    dataPacketReceived: (packet: DataPacket) => void;
    transcriptionReceived: (transcription: Transcription) => void;
    transportsCreated: (publisher: PCTransport, subscriber: PCTransport) => void;
    /** @internal */
    trackSenderAdded: (track: Track, sender: RTCRtpSender) => void;
    rtpVideoMapUpdate: (rtpMap: Map<number, VideoCodec>) => void;
    dcBufferStatusChanged: (isLow: boolean, kind: DataPacket_Kind) => void;
    participantUpdate: (infos: ParticipantInfo[]) => void;
    roomUpdate: (room: RoomModel) => void;
    connectionQualityUpdate: (update: ConnectionQualityUpdate) => void;
    speakersChanged: (speakerUpdates: SpeakerInfo[]) => void;
    streamStateChanged: (update: StreamStateUpdate) => void;
    subscriptionError: (resp: SubscriptionResponse) => void;
    subscriptionPermissionUpdate: (update: SubscriptionPermissionUpdate) => void;
    subscribedQualityUpdate: (update: SubscribedQualityUpdate) => void;
    localTrackUnpublished: (unpublishedResponse: TrackUnpublishedResponse) => void;
    localTrackSubscribed: (trackSid: string) => void;
    remoteMute: (trackSid: string, muted: boolean) => void;
    offline: () => void;
    signalRequestResponse: (response: RequestResponse) => void;
};
export {};
//# sourceMappingURL=RTCEngine.d.ts.map