import type TypedEmitter from 'typed-emitter';
import 'webrtc-adapter';
import type { InternalRoomOptions, RoomConnectOptions, RoomOptions } from '../options';
import { DataPacket_Kind, DisconnectReason, ParticipantPermission, SubscriptionError } from '../proto/livekit_models_pb';
import RTCEngine from './RTCEngine';
import LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import LocalTrackPublication from './track/LocalTrackPublication';
import type RemoteTrack from './track/RemoteTrack';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import type { SimulationOptions, SimulationScenario } from './types';
export declare enum ConnectionState {
    Disconnected = "disconnected",
    Connecting = "connecting",
    Connected = "connected",
    Reconnecting = "reconnecting"
}
/** @deprecated RoomState has been renamed to [[ConnectionState]] */
export declare const RoomState: typeof ConnectionState;
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
    /** map of sid: [[RemoteParticipant]] */
    participants: Map<string, RemoteParticipant>;
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
    private roomInfo?;
    private identityToSid;
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
    private cachedParticipantSids;
    private connectionReconcileInterval?;
    private regionUrlProvider?;
    private regionUrl?;
    /**
     * Creates a new Room, the primary construct for a LiveKit session.
     * @param options
     */
    constructor(options?: RoomOptions);
    /**
     * @experimental
     */
    setE2EEEnabled(enabled: boolean): Promise<void>;
    private setupE2EE;
    /**
     * if the current room has a participant with `recorder: true` in its JWT grant
     **/
    get isRecording(): boolean;
    /** server assigned unique room id */
    get sid(): string;
    /** user assigned name, derived from JWT token */
    get name(): string;
    /** room metadata */
    get metadata(): string | undefined;
    get numParticipants(): number;
    get numPublishers(): number;
    private maybeCreateEngine;
    /**
     * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
     * In particular, it handles Chrome's unique behavior of creating `default`
     * devices. When encountered, it'll be removed from the list of devices.
     * The actual default device will be placed at top.
     * @param kind
     * @returns a list of available local devices
     */
    static getLocalDevices(kind?: MediaDeviceKind, requestPermissions?: boolean): Promise<MediaDeviceInfo[]>;
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
    startAudio(): Promise<void>;
    /**
     * Returns true if audio playback is enabled
     */
    get canPlaybackAudio(): boolean;
    /**
     * Returns the active audio output device used in this room.
     * @return the previously successfully set audio output device ID or an empty string if the default device is used.
     * @deprecated use `getActiveDevice('audiooutput')` instead
     */
    getActiveAudioOutputDevice(): string;
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
    private handleAudioPlaybackStarted;
    private handleAudioPlaybackFailed;
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
    private registerConnectionReconcile;
    private clearConnectionReconcile;
    private setAndEmitConnectionState;
    private emitWhenConnected;
    private onLocalParticipantMetadataChanged;
    private onLocalParticipantNameChanged;
    private onLocalTrackMuted;
    private onLocalTrackUnmuted;
    private onLocalTrackPublished;
    private onLocalTrackUnpublished;
    private onLocalConnectionQualityChanged;
    private onMediaDevicesError;
    private onLocalParticipantPermissionsChanged;
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
    reconnected: () => void;
    disconnected: (reason?: DisconnectReason) => void;
    /** @deprecated stateChanged has been renamed to connectionStateChanged */
    stateChanged: (state: ConnectionState) => void;
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
    activeSpeakersChanged: (speakers: Array<Participant>) => void;
    roomMetadataChanged: (metadata: string) => void;
    dataReceived: (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string) => void;
    connectionQualityChanged: (quality: ConnectionQuality, participant: Participant) => void;
    mediaDevicesError: (error: Error) => void;
    trackStreamStateChanged: (publication: RemoteTrackPublication, streamState: Track.StreamState, participant: RemoteParticipant) => void;
    trackSubscriptionPermissionChanged: (publication: RemoteTrackPublication, status: TrackPublication.PermissionStatus, participant: RemoteParticipant) => void;
    trackSubscriptionStatusChanged: (publication: RemoteTrackPublication, status: TrackPublication.SubscriptionStatus, participant: RemoteParticipant) => void;
    audioPlaybackChanged: (playing: boolean) => void;
    signalConnected: () => void;
    recordingStatusChanged: (recording: boolean) => void;
    participantEncryptionStatusChanged: (encrypted: boolean, participant?: Participant) => void;
    encryptionError: (error: Error) => void;
    dcBufferStatusChanged: (isLow: boolean, kind: DataPacket_Kind) => void;
    activeDeviceChanged: (kind: MediaDeviceKind, deviceId: string) => void;
};
//# sourceMappingURL=Room.d.ts.map