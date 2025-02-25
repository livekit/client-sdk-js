import { DataPacket_Kind, DisconnectReason, MetricsBatch, ParticipantPermission, ServerInfo, SipDTMF, SubscriptionError, TranscriptionSegment as TranscriptionSegmentModel } from '@livekit/protocol';
import type TypedEmitter from 'typed-emitter';
import 'webrtc-adapter';
import type { InternalRoomOptions, RoomConnectOptions, RoomOptions } from '../options';
import RTCEngine from './RTCEngine';
import { type ByteStreamHandler, type TextStreamHandler } from './StreamReader';
import LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import { type RpcInvocationData } from './rpc';
import LocalTrackPublication from './track/LocalTrackPublication';
import type RemoteTrack from './track/RemoteTrack';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import { type ChatMessage, type SimulationOptions, type SimulationScenario, type TranscriptionSegment } from './types';
export declare enum ConnectionState {
    Disconnected = "disconnected",
    Connecting = "connecting",
    Connected = "connected",
    Reconnecting = "reconnecting",
    SignalReconnecting = "signalReconnecting"
}
declare const Room_base: new () => TypedEmitter<RoomEventCallbacks>;
/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
declare class Room extends Room_base {
    state: ConnectionState;
    /**
     * map of identity: [[RemoteParticipant]]
     */
    remoteParticipants: Map<string, RemoteParticipant>;
    /**
     * list of participants that are actively speaking. when this changes
     * a [[RoomEvent.ActiveSpeakersChanged]] event is fired
     */
    activeSpeakers: Participant[];
    /** @internal */
    engine: RTCEngine;
    /** the current participant */
    localParticipant: LocalParticipant;
    /** options of room */
    options: InternalRoomOptions;
    /** reflects the sender encryption status of the local participant */
    isE2EEEnabled: boolean;
    serverInfo?: Partial<ServerInfo>;
    private roomInfo?;
    private sidToIdentity;
    /** connect options of room */
    private connOptions?;
    private audioEnabled;
    private audioContext?;
    /** used for aborting pending connections to a LiveKit server */
    private abortController?;
    /** future holding client initiated connection attempt */
    private connectFuture?;
    private disconnectLock;
    private e2eeManager;
    private connectionReconcileInterval?;
    private regionUrlProvider?;
    private regionUrl?;
    private isVideoPlaybackBlocked;
    private log;
    private bufferedEvents;
    private isResuming;
    /**
     * map to store first point in time when a particular transcription segment was received
     */
    private transcriptionReceivedTimes;
    private byteStreamControllers;
    private textStreamControllers;
    private byteStreamHandlers;
    private textStreamHandlers;
    private rpcHandlers;
    /**
     * Creates a new Room, the primary construct for a LiveKit session.
     * @param options
     */
    constructor(options?: RoomOptions);
    registerTextStreamHandler(topic: string, callback: TextStreamHandler): void;
    unregisterTextStreamHandler(topic: string): void;
    registerByteStreamHandler(topic: string, callback: ByteStreamHandler): void;
    unregisterByteStreamHandler(topic: string): void;
    /**
     * Establishes the participant as a receiver for calls of the specified RPC method.
     *
     * @param method - The name of the indicated RPC method
     * @param handler - Will be invoked when an RPC request for this method is received
     * @returns A promise that resolves when the method is successfully registered
     * @throws {Error} If a handler for this method is already registered (must call unregisterRpcMethod first)
     *
     * @example
     * ```typescript
     * room.localParticipant?.registerRpcMethod(
     *   'greet',
     *   async (data: RpcInvocationData) => {
     *     console.log(`Received greeting from ${data.callerIdentity}: ${data.payload}`);
     *     return `Hello, ${data.callerIdentity}!`;
     *   }
     * );
     * ```
     *
     * The handler should return a Promise that resolves to a string.
     * If unable to respond within `responseTimeout`, the request will result in an error on the caller's side.
     *
     * You may throw errors of type `RpcError` with a string `message` in the handler,
     * and they will be received on the caller's side with the message intact.
     * Other errors thrown in your handler will not be transmitted as-is, and will instead arrive to the caller as `1500` ("Application Error").
     */
    registerRpcMethod(method: string, handler: (data: RpcInvocationData) => Promise<string>): void;
    /**
     * Unregisters a previously registered RPC method.
     *
     * @param method - The name of the RPC method to unregister
     */
    unregisterRpcMethod(method: string): void;
    private handleIncomingRpcRequest;
    /**
     * @experimental
     */
    setE2EEEnabled(enabled: boolean): Promise<void>;
    private setupE2EE;
    private get logContext();
    /**
     * if the current room has a participant with `recorder: true` in its JWT grant
     **/
    get isRecording(): boolean;
    /**
     * server assigned unique room id.
     * returns once a sid has been issued by the server.
     */
    getSid(): Promise<string>;
    /** user assigned name, derived from JWT token */
    get name(): string;
    /** room metadata */
    get metadata(): string | undefined;
    get numParticipants(): number;
    get numPublishers(): number;
    private maybeCreateEngine;
    /**
     * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
     * In particular, it requests device permissions by default if needed
     * and makes sure the returned device does not consist of dummy devices
     * @param kind
     * @returns a list of available local devices
     */
    static getLocalDevices(kind?: MediaDeviceKind, requestPermissions?: boolean): Promise<MediaDeviceInfo[]>;
    static cleanupRegistry: false | FinalizationRegistry<() => void>;
    /**
     * prepareConnection should be called as soon as the page is loaded, in order
     * to speed up the connection attempt. This function will
     * - perform DNS resolution and pre-warm the DNS cache
     * - establish TLS connection and cache TLS keys
     *
     * With LiveKit Cloud, it will also determine the best edge data center for
     * the current client to connect to if a token is provided.
     */
    prepareConnection(url: string, token?: string): Promise<void>;
    connect: (url: string, token: string, opts?: RoomConnectOptions) => Promise<void>;
    private connectSignal;
    private applyJoinResponse;
    private attemptConnection;
    /**
     * disconnects the room, emits [[RoomEvent.Disconnected]]
     */
    disconnect: (stopTracks?: boolean) => Promise<void>;
    /**
     * retrieves a participant by identity
     * @param identity
     * @returns
     */
    getParticipantByIdentity(identity: string): Participant | undefined;
    private clearConnectionFutures;
    /**
     * @internal for testing
     */
    simulateScenario(scenario: SimulationScenario, arg?: any): Promise<void>;
    private onPageLeave;
    /**
     * Browsers have different policies regarding audio playback. Most requiring
     * some form of user interaction (click/tap/etc).
     * In those cases, audio will be silent until a click/tap triggering one of the following
     * - `startAudio`
     * - `getUserMedia`
     */
    startAudio: () => Promise<void>;
    startVideo: () => Promise<void>;
    /**
     * Returns true if audio playback is enabled
     */
    get canPlaybackAudio(): boolean;
    /**
     * Returns true if video playback is enabled
     */
    get canPlaybackVideo(): boolean;
    getActiveDevice(kind: MediaDeviceKind): string | undefined;
    /**
     * Switches all active devices used in this room to the given device.
     *
     * Note: setting AudioOutput is not supported on some browsers. See [setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId#browser_compatibility)
     *
     * @param kind use `videoinput` for camera track,
     *  `audioinput` for microphone track,
     *  `audiooutput` to set speaker for all incoming audio tracks
     * @param deviceId
     */
    switchActiveDevice(kind: MediaDeviceKind, deviceId: string, exact?: boolean): Promise<boolean>;
    private setupLocalParticipantEvents;
    private recreateEngine;
    private onTrackAdded;
    private handleRestarting;
    private handleSignalRestarted;
    private handleDisconnect;
    private handleParticipantUpdates;
    private handleParticipantDisconnected;
    private handleActiveSpeakersUpdate;
    private handleSpeakersChanged;
    private handleStreamStateUpdate;
    private handleSubscriptionPermissionUpdate;
    private handleSubscriptionError;
    private handleDataPacket;
    private handleStreamHeader;
    private handleStreamChunk;
    private handleStreamTrailer;
    private handleUserPacket;
    private handleSipDtmf;
    bufferedSegments: Map<string, TranscriptionSegmentModel>;
    private handleTranscription;
    private handleChatMessage;
    private handleMetrics;
    private handleAudioPlaybackStarted;
    private handleAudioPlaybackFailed;
    private handleVideoPlaybackStarted;
    private handleVideoPlaybackFailed;
    private handleDeviceChange;
    private handleRoomUpdate;
    private handleConnectionQualityUpdate;
    private acquireAudioContext;
    private createParticipant;
    private getOrCreateParticipant;
    private sendSyncState;
    /**
     * After resuming, we'll need to notify the server of the current
     * subscription settings.
     */
    private updateSubscriptions;
    private getRemoteParticipantBySid;
    private registerConnectionReconcile;
    private clearConnectionReconcile;
    private setAndEmitConnectionState;
    private emitBufferedEvents;
    private emitWhenConnected;
    private onLocalParticipantMetadataChanged;
    private onLocalParticipantNameChanged;
    private onLocalAttributesChanged;
    private onLocalTrackMuted;
    private onLocalTrackUnmuted;
    private onTrackProcessorUpdate;
    private onLocalTrackPublished;
    private onLocalTrackUnpublished;
    private onLocalTrackRestarted;
    private onLocalConnectionQualityChanged;
    private onMediaDevicesError;
    private onLocalParticipantPermissionsChanged;
    private onLocalChatMessageSent;
    /**
     * Allows to populate a room with simulated participants.
     * No actual connection to a server will be established, all state is
     * @experimental
     */
    simulateParticipants(options: SimulationOptions): Promise<void>;
    emit<E extends keyof RoomEventCallbacks>(event: E, ...args: Parameters<RoomEventCallbacks[E]>): boolean;
}
export default Room;
export type RoomEventCallbacks = {
    connected: () => void;
    reconnecting: () => void;
    signalReconnecting: () => void;
    reconnected: () => void;
    disconnected: (reason?: DisconnectReason) => void;
    connectionStateChanged: (state: ConnectionState) => void;
    mediaDevicesChanged: () => void;
    participantConnected: (participant: RemoteParticipant) => void;
    participantDisconnected: (participant: RemoteParticipant) => void;
    trackPublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
    trackSubscribed: (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
    trackSubscriptionFailed: (trackSid: string, participant: RemoteParticipant, reason?: SubscriptionError) => void;
    trackUnpublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
    trackUnsubscribed: (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
    trackMuted: (publication: TrackPublication, participant: Participant) => void;
    trackUnmuted: (publication: TrackPublication, participant: Participant) => void;
    localTrackPublished: (publication: LocalTrackPublication, participant: LocalParticipant) => void;
    localTrackUnpublished: (publication: LocalTrackPublication, participant: LocalParticipant) => void;
    localAudioSilenceDetected: (publication: LocalTrackPublication) => void;
    participantMetadataChanged: (metadata: string | undefined, participant: RemoteParticipant | LocalParticipant) => void;
    participantNameChanged: (name: string, participant: RemoteParticipant | LocalParticipant) => void;
    participantPermissionsChanged: (prevPermissions: ParticipantPermission | undefined, participant: RemoteParticipant | LocalParticipant) => void;
    participantAttributesChanged: (changedAttributes: Record<string, string>, participant: RemoteParticipant | LocalParticipant) => void;
    activeSpeakersChanged: (speakers: Array<Participant>) => void;
    roomMetadataChanged: (metadata: string) => void;
    dataReceived: (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string) => void;
    sipDTMFReceived: (dtmf: SipDTMF, participant?: RemoteParticipant) => void;
    transcriptionReceived: (transcription: TranscriptionSegment[], participant?: Participant, publication?: TrackPublication) => void;
    connectionQualityChanged: (quality: ConnectionQuality, participant: Participant) => void;
    mediaDevicesError: (error: Error) => void;
    trackStreamStateChanged: (publication: RemoteTrackPublication, streamState: Track.StreamState, participant: RemoteParticipant) => void;
    trackSubscriptionPermissionChanged: (publication: RemoteTrackPublication, status: TrackPublication.PermissionStatus, participant: RemoteParticipant) => void;
    trackSubscriptionStatusChanged: (publication: RemoteTrackPublication, status: TrackPublication.SubscriptionStatus, participant: RemoteParticipant) => void;
    audioPlaybackChanged: (playing: boolean) => void;
    videoPlaybackChanged: (playing: boolean) => void;
    signalConnected: () => void;
    recordingStatusChanged: (recording: boolean) => void;
    participantEncryptionStatusChanged: (encrypted: boolean, participant?: Participant) => void;
    encryptionError: (error: Error) => void;
    dcBufferStatusChanged: (isLow: boolean, kind: DataPacket_Kind) => void;
    activeDeviceChanged: (kind: MediaDeviceKind, deviceId: string) => void;
    chatMessage: (message: ChatMessage, participant?: RemoteParticipant | LocalParticipant) => void;
    localTrackSubscribed: (publication: LocalTrackPublication, participant: LocalParticipant) => void;
    metricsReceived: (metrics: MetricsBatch, participant?: Participant) => void;
};
//# sourceMappingURL=Room.d.ts.map