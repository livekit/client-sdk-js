import type { SipDTMF } from '@livekit/protocol';
import { DataPacket_Kind, ParticipantInfo, ParticipantInfo_Kind as ParticipantKind, ParticipantPermission, ConnectionQuality as ProtoQuality, SubscriptionError } from '@livekit/protocol';
import type TypedEmitter from 'typed-emitter';
import type { StructuredLogger } from '../../logger';
import type LocalTrackPublication from '../track/LocalTrackPublication';
import type RemoteTrack from '../track/RemoteTrack';
import type RemoteTrackPublication from '../track/RemoteTrackPublication';
import { Track } from '../track/Track';
import type { TrackPublication } from '../track/TrackPublication';
import type { ChatMessage, LoggerOptions, TranscriptionSegment } from '../types';
export declare enum ConnectionQuality {
    Excellent = "excellent",
    Good = "good",
    Poor = "poor",
    /**
     * Indicates that a participant has temporarily (or permanently) lost connection to LiveKit.
     * For permanent disconnection a `ParticipantDisconnected` event will be emitted after a timeout
     */
    Lost = "lost",
    Unknown = "unknown"
}
export { ParticipantKind };
declare const Participant_base: new () => TypedEmitter<ParticipantEventCallbacks>;
export default class Participant extends Participant_base {
    protected participantInfo?: ParticipantInfo;
    audioTrackPublications: Map<string, TrackPublication>;
    videoTrackPublications: Map<string, TrackPublication>;
    /** map of track sid => all published tracks */
    trackPublications: Map<string, TrackPublication>;
    /** audio level between 0-1.0, 1 being loudest, 0 being softest */
    audioLevel: number;
    /** if participant is currently speaking */
    isSpeaking: boolean;
    /** server assigned unique id */
    sid: string;
    /** client assigned identity, encoded in JWT token */
    identity: string;
    /** client assigned display name, encoded in JWT token */
    name?: string;
    /** client metadata, opaque to livekit */
    metadata?: string;
    private _attributes;
    lastSpokeAt?: Date | undefined;
    permissions?: ParticipantPermission;
    protected _kind: ParticipantKind;
    private _connectionQuality;
    protected audioContext?: AudioContext;
    protected log: StructuredLogger;
    protected loggerOptions?: LoggerOptions;
    protected get logContext(): {
        [x: string]: unknown;
    };
    get isEncrypted(): boolean;
    get isAgent(): boolean;
    get kind(): ParticipantKind;
    /** participant attributes, similar to metadata, but as a key/value map */
    get attributes(): Readonly<Record<string, string>>;
    /** @internal */
    constructor(sid: string, identity: string, name?: string, metadata?: string, attributes?: Record<string, string>, loggerOptions?: LoggerOptions, kind?: ParticipantKind);
    getTrackPublications(): TrackPublication[];
    /**
     * Finds the first track that matches the source filter, for example, getting
     * the user's camera track with getTrackBySource(Track.Source.Camera).
     */
    getTrackPublication(source: Track.Source): TrackPublication | undefined;
    /**
     * Finds the first track that matches the track's name.
     */
    getTrackPublicationByName(name: string): TrackPublication | undefined;
    get connectionQuality(): ConnectionQuality;
    get isCameraEnabled(): boolean;
    get isMicrophoneEnabled(): boolean;
    get isScreenShareEnabled(): boolean;
    get isLocal(): boolean;
    /** when participant joined the room */
    get joinedAt(): Date | undefined;
    /** @internal */
    updateInfo(info: ParticipantInfo): boolean;
    /**
     * Updates metadata from server
     **/
    private _setMetadata;
    private _setName;
    /**
     * Updates metadata from server
     **/
    private _setAttributes;
    /** @internal */
    setPermissions(permissions: ParticipantPermission): boolean;
    /** @internal */
    setIsSpeaking(speaking: boolean): void;
    /** @internal */
    setConnectionQuality(q: ProtoQuality): void;
    /**
     * @internal
     */
    setAudioContext(ctx: AudioContext | undefined): void;
    protected addTrackPublication(publication: TrackPublication): void;
}
export type ParticipantEventCallbacks = {
    trackPublished: (publication: RemoteTrackPublication) => void;
    trackSubscribed: (track: RemoteTrack, publication: RemoteTrackPublication) => void;
    trackSubscriptionFailed: (trackSid: string, reason?: SubscriptionError) => void;
    trackUnpublished: (publication: RemoteTrackPublication) => void;
    trackUnsubscribed: (track: RemoteTrack, publication: RemoteTrackPublication) => void;
    trackMuted: (publication: TrackPublication) => void;
    trackUnmuted: (publication: TrackPublication) => void;
    localTrackPublished: (publication: LocalTrackPublication) => void;
    localTrackUnpublished: (publication: LocalTrackPublication) => void;
    participantMetadataChanged: (prevMetadata: string | undefined, participant?: any) => void;
    participantNameChanged: (name: string) => void;
    dataReceived: (payload: Uint8Array, kind: DataPacket_Kind) => void;
    sipDTMFReceived: (dtmf: SipDTMF) => void;
    transcriptionReceived: (transcription: TranscriptionSegment[], publication?: TrackPublication) => void;
    isSpeakingChanged: (speaking: boolean) => void;
    connectionQualityChanged: (connectionQuality: ConnectionQuality) => void;
    trackStreamStateChanged: (publication: RemoteTrackPublication, streamState: Track.StreamState) => void;
    trackSubscriptionPermissionChanged: (publication: RemoteTrackPublication, status: TrackPublication.PermissionStatus) => void;
    mediaDevicesError: (error: Error) => void;
    audioStreamAcquired: () => void;
    participantPermissionsChanged: (prevPermissions?: ParticipantPermission) => void;
    trackSubscriptionStatusChanged: (publication: RemoteTrackPublication, status: TrackPublication.SubscriptionStatus) => void;
    attributesChanged: (changedAttributes: Record<string, string>) => void;
    localTrackSubscribed: (trackPublication: LocalTrackPublication) => void;
    chatMessage: (msg: ChatMessage) => void;
};
//# sourceMappingURL=Participant.d.ts.map
