import { Encryption_Type } from '@livekit/protocol';
import type { SubscriptionError, TrackInfo, UpdateSubscription, UpdateTrackSettings } from '@livekit/protocol';
import type TypedEventEmitter from 'typed-emitter';
import type { LoggerOptions, TranscriptionSegment } from '../types';
import LocalAudioTrack from './LocalAudioTrack';
import LocalVideoTrack from './LocalVideoTrack';
import RemoteAudioTrack from './RemoteAudioTrack';
import type RemoteTrack from './RemoteTrack';
import RemoteVideoTrack from './RemoteVideoTrack';
import { Track } from './Track';
declare const TrackPublication_base: new () => TypedEventEmitter<PublicationEventCallbacks>;
export declare abstract class TrackPublication extends TrackPublication_base {
    kind: Track.Kind;
    trackName: string;
    trackSid: Track.SID;
    track?: Track;
    source: Track.Source;
    /** MimeType of the published track */
    mimeType?: string;
    /** dimension of the original published stream, video-only */
    dimensions?: Track.Dimensions;
    /** true if track was simulcasted to server, video-only */
    simulcasted?: boolean;
    /** @internal */
    trackInfo?: TrackInfo;
    protected metadataMuted: boolean;
    protected encryption: Encryption_Type;
    protected log: import("../../logger").StructuredLogger;
    private loggerContextCb?;
    constructor(kind: Track.Kind, id: string, name: string, loggerOptions?: LoggerOptions);
    /** @internal */
    setTrack(track?: Track): void;
    protected get logContext(): {
        [x: string]: unknown;
    };
    get isMuted(): boolean;
    get isEnabled(): boolean;
    get isSubscribed(): boolean;
    get isEncrypted(): boolean;
    abstract get isLocal(): boolean;
    /**
     * an [AudioTrack] if this publication holds an audio track
     */
    get audioTrack(): LocalAudioTrack | RemoteAudioTrack | undefined;
    /**
     * an [VideoTrack] if this publication holds a video track
     */
    get videoTrack(): LocalVideoTrack | RemoteVideoTrack | undefined;
    handleMuted: () => void;
    handleUnmuted: () => void;
    /** @internal */
    updateInfo(info: TrackInfo): void;
}
export declare namespace TrackPublication {
    enum SubscriptionStatus {
        Desired = "desired",
        Subscribed = "subscribed",
        Unsubscribed = "unsubscribed"
    }
    enum PermissionStatus {
        Allowed = "allowed",
        NotAllowed = "not_allowed"
    }
}
export type PublicationEventCallbacks = {
    muted: () => void;
    unmuted: () => void;
    ended: (track?: Track) => void;
    updateSettings: (settings: UpdateTrackSettings) => void;
    subscriptionPermissionChanged: (status: TrackPublication.PermissionStatus, prevStatus: TrackPublication.PermissionStatus) => void;
    updateSubscription: (sub: UpdateSubscription) => void;
    subscribed: (track: RemoteTrack) => void;
    unsubscribed: (track: RemoteTrack) => void;
    subscriptionStatusChanged: (status: TrackPublication.SubscriptionStatus, prevStatus: TrackPublication.SubscriptionStatus) => void;
    subscriptionFailed: (error: SubscriptionError) => void;
    transcriptionReceived: (transcription: TranscriptionSegment[]) => void;
    timeSyncUpdate: (timestamp: number) => void;
};
export {};
//# sourceMappingURL=TrackPublication.d.ts.map
