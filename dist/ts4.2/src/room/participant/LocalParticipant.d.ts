import { ParticipantInfo, ParticipantPermission } from '@livekit/protocol';
import type { InternalRoomOptions } from '../../options';
import type RTCEngine from '../RTCEngine';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import { Track } from '../track/Track';
import type { AudioCaptureOptions, BackupVideoCodec, CreateLocalTracksOptions, ScreenShareCaptureOptions, TrackPublishOptions, VideoCaptureOptions } from '../track/options';
import type { DataPublishOptions } from '../types';
import Participant from './Participant';
import type { ParticipantTrackPermission } from './ParticipantTrackPermission';
export default class LocalParticipant extends Participant {
    audioTrackPublications: Map<string, LocalTrackPublication>;
    videoTrackPublications: Map<string, LocalTrackPublication>;
    /** map of track sid => all published tracks */
    trackPublications: Map<string, LocalTrackPublication>;
    /** @internal */
    engine: RTCEngine;
    /** @internal */
    activeDeviceMap: Map<MediaDeviceKind, string>;
    private pendingPublishing;
    private pendingPublishPromises;
    private cameraError;
    private microphoneError;
    private participantTrackPermissions;
    private allParticipantsAllowedToSubscribe;
    private roomOptions;
    private encryptionType;
    private reconnectFuture?;
    /** @internal */
    constructor(sid: string, identity: string, engine: RTCEngine, options: InternalRoomOptions);
    get lastCameraError(): Error | undefined;
    get lastMicrophoneError(): Error | undefined;
    get isE2EEEnabled(): boolean;
    getTrackPublication(source: Track.Source): LocalTrackPublication | undefined;
    getTrackPublicationByName(name: string): LocalTrackPublication | undefined;
    /**
     * @internal
     */
    setupEngine(engine: RTCEngine): void;
    private handleReconnecting;
    private handleReconnected;
    private handleDisconnected;
    /**
     * Sets and updates the metadata of the local participant.
     * The change does not take immediate effect.
     * If successful, a `ParticipantEvent.MetadataChanged` event will be emitted on the local participant.
     * Note: this requires `canUpdateOwnMetadata` permission.
     * @param metadata
     */
    setMetadata(metadata: string): void;
    /**
     * Sets and updates the name of the local participant.
     * The change does not take immediate effect.
     * If successful, a `ParticipantEvent.ParticipantNameChanged` event will be emitted on the local participant.
     * Note: this requires `canUpdateOwnMetadata` permission.
     * @param metadata
     */
    setName(name: string): void;
    /**
     * Enable or disable a participant's camera track.
     *
     * If a track has already published, it'll mute or unmute the track.
     * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
     */
    setCameraEnabled(enabled: boolean, options?: VideoCaptureOptions, publishOptions?: TrackPublishOptions): Promise<LocalTrackPublication | undefined>;
    /**
     * Enable or disable a participant's microphone track.
     *
     * If a track has already published, it'll mute or unmute the track.
     * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
     */
    setMicrophoneEnabled(enabled: boolean, options?: AudioCaptureOptions, publishOptions?: TrackPublishOptions): Promise<LocalTrackPublication | undefined>;
    /**
     * Start or stop sharing a participant's screen
     * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
     */
    setScreenShareEnabled(enabled: boolean, options?: ScreenShareCaptureOptions, publishOptions?: TrackPublishOptions): Promise<LocalTrackPublication | undefined>;
    /** @internal */
    setPermissions(permissions: ParticipantPermission): boolean;
    /** @internal */
    setE2EEEnabled(enabled: boolean): Promise<void>;
    /**
     * Enable or disable publishing for a track by source. This serves as a simple
     * way to manage the common tracks (camera, mic, or screen share).
     * Resolves with LocalTrackPublication if successful and void otherwise
     */
    private setTrackEnabled;
    /**
     * Publish both camera and microphone at the same time. This is useful for
     * displaying a single Permission Dialog box to the end user.
     */
    enableCameraAndMicrophone(): Promise<void>;
    /**
     * Create local camera and/or microphone tracks
     * @param options
     * @returns
     */
    createTracks(options?: CreateLocalTracksOptions): Promise<LocalTrack[]>;
    /**
     * Creates a screen capture tracks with getDisplayMedia().
     * A LocalVideoTrack is always created and returned.
     * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
     */
    createScreenTracks(options?: ScreenShareCaptureOptions): Promise<Array<LocalTrack>>;
    /**
     * Publish a new track to the room
     * @param track
     * @param options
     */
    publishTrack(track: LocalTrack | MediaStreamTrack, options?: TrackPublishOptions): Promise<LocalTrackPublication>;
    private publish;
    get isLocal(): boolean;
    /** @internal
     * publish additional codec to existing track
     */
    publishAdditionalCodecForTrack(track: LocalTrack | MediaStreamTrack, videoCodec: BackupVideoCodec, options?: TrackPublishOptions): Promise<void>;
    unpublishTrack(track: LocalTrack | MediaStreamTrack, stopOnUnpublish?: boolean): Promise<LocalTrackPublication | undefined>;
    unpublishTracks(tracks: LocalTrack[] | MediaStreamTrack[]): Promise<LocalTrackPublication[]>;
    republishAllTracks(options?: TrackPublishOptions, restartTracks?: boolean): Promise<void>;
    /**
     * Publish a new data payload to the room. Data will be forwarded to each
     * participant in the room if the destination field in publishOptions is empty
     *
     * @param data Uint8Array of the payload. To send string data, use TextEncoder.encode
     * @param options optionally specify a `reliable`, `topic` and `destination`
     */
    publishData(data: Uint8Array, options?: DataPublishOptions): Promise<void>;
    /**
     * Control who can subscribe to LocalParticipant's published tracks.
     *
     * By default, all participants can subscribe. This allows fine-grained control over
     * who is able to subscribe at a participant and track level.
     *
     * Note: if access is given at a track-level (i.e. both [allParticipantsAllowed] and
     * [ParticipantTrackPermission.allTracksAllowed] are false), any newer published tracks
     * will not grant permissions to any participants and will require a subsequent
     * permissions update to allow subscription.
     *
     * @param allParticipantsAllowed Allows all participants to subscribe all tracks.
     *  Takes precedence over [[participantTrackPermissions]] if set to true.
     *  By default this is set to true.
     * @param participantTrackPermissions Full list of individual permissions per
     *  participant/track. Any omitted participants will not receive any permissions.
     */
    setTrackSubscriptionPermissions(allParticipantsAllowed: boolean, participantTrackPermissions?: ParticipantTrackPermission[]): void;
    /** @internal */
    updateInfo(info: ParticipantInfo): boolean;
    private updateTrackSubscriptionPermissions;
    /** @internal */
    private onTrackUnmuted;
    /** @internal */
    private onTrackMuted;
    private onTrackUpstreamPaused;
    private onTrackUpstreamResumed;
    private onTrackFeatureUpdate;
    private handleSubscribedQualityUpdate;
    private handleLocalTrackUnpublished;
    private handleTrackEnded;
    private getPublicationForTrack;
}
//# sourceMappingURL=LocalParticipant.d.ts.map
