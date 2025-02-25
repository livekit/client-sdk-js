import { AudioTrackFeature, StreamState as ProtoStreamState, TrackSource, TrackType } from '@livekit/protocol';
import type TypedEventEmitter from 'typed-emitter';
import type { SignalClient } from '../../api/SignalClient';
import type { StructuredLogger } from '../../logger';
import type { LoggerOptions } from '../types';
import type { TrackProcessor } from './processor/types';
export declare enum VideoQuality {
    LOW = 0,
    MEDIUM = 1,
    HIGH = 2
}
declare const Track_base: new () => TypedEventEmitter<TrackEventCallbacks>;
export declare abstract class Track<TrackKind extends Track.Kind = Track.Kind> extends Track_base {
    readonly kind: TrackKind;
    attachedElements: HTMLMediaElement[];
    isMuted: boolean;
    source: Track.Source;
    /**
     * sid is set after track is published to server, or if it's a remote track
     */
    sid?: Track.SID;
    /**
     * @internal
     */
    mediaStream?: MediaStream;
    /**
     * indicates current state of stream, it'll indicate `paused` if the track
     * has been paused by congestion controller
     */
    streamState: Track.StreamState;
    /** @internal */
    rtpTimestamp: number | undefined;
    protected _mediaStreamTrack: MediaStreamTrack;
    protected _mediaStreamID: string;
    protected isInBackground: boolean;
    private backgroundTimeout;
    private loggerContextCb;
    protected timeSyncHandle: number | undefined;
    protected _currentBitrate: number;
    protected monitorInterval?: ReturnType<typeof setInterval>;
    protected log: StructuredLogger;
    protected constructor(mediaTrack: MediaStreamTrack, kind: TrackKind, loggerOptions?: LoggerOptions);
    protected get logContext(): {
        [x: string]: unknown;
    };
    /** current receive bits per second */
    get currentBitrate(): number;
    get mediaStreamTrack(): MediaStreamTrack;
    abstract get isLocal(): boolean;
    /**
     * @internal
     * used for keep mediaStream's first id, since it's id might change
     * if we disable/enable a track
     */
    get mediaStreamID(): string;
    /**
     * creates a new HTMLAudioElement or HTMLVideoElement, attaches to it, and returns it
     */
    attach(): HTMLMediaElement;
    /**
     * attaches track to an existing HTMLAudioElement or HTMLVideoElement
     */
    attach(element: HTMLMediaElement): HTMLMediaElement;
    /**
     * Detaches from all attached elements
     */
    detach(): HTMLMediaElement[];
    /**
     * Detach from a single element
     * @param element
     */
    detach(element: HTMLMediaElement): HTMLMediaElement;
    stop(): void;
    protected enable(): void;
    protected disable(): void;
    abstract startMonitor(signalClient?: SignalClient): void;
    stopMonitor(): void;
    /** @internal */
    updateLoggerOptions(loggerOptions: LoggerOptions): void;
    private recycleElement;
    protected appVisibilityChangedListener: () => void;
    protected handleAppVisibilityChanged(): Promise<void>;
    protected addAppVisibilityListener(): void;
    protected removeAppVisibilityListener(): void;
}
export declare function attachToElement(track: MediaStreamTrack, element: HTMLMediaElement): void;
/** @internal */
export declare function detachTrack(track: MediaStreamTrack, element: HTMLMediaElement): void;
export declare namespace Track {
    enum Kind {
        Audio = "audio",
        Video = "video",
        Unknown = "unknown"
    }
    type SID = string;
    enum Source {
        Camera = "camera",
        Microphone = "microphone",
        ScreenShare = "screen_share",
        ScreenShareAudio = "screen_share_audio",
        Unknown = "unknown"
    }
    enum StreamState {
        Active = "active",
        Paused = "paused",
        Unknown = "unknown"
    }
    interface Dimensions {
        width: number;
        height: number;
    }
    /** @internal */
    function kindToProto(k: Kind): TrackType;
    /** @internal */
    function kindFromProto(t: TrackType): Kind | undefined;
    /** @internal */
    function sourceToProto(s: Source): TrackSource;
    /** @internal */
    function sourceFromProto(s: TrackSource): Source;
    /** @internal */
    function streamStateFromProto(s: ProtoStreamState): StreamState;
}
export type TrackEventCallbacks = {
    message: () => void;
    muted: (track?: any) => void;
    unmuted: (track?: any) => void;
    restarted: (track?: any) => void;
    ended: (track?: any) => void;
    updateSettings: () => void;
    updateSubscription: () => void;
    audioPlaybackStarted: () => void;
    audioPlaybackFailed: (error?: Error) => void;
    audioSilenceDetected: () => void;
    visibilityChanged: (visible: boolean, track?: any) => void;
    videoDimensionsChanged: (dimensions: Track.Dimensions, track?: any) => void;
    videoPlaybackStarted: () => void;
    videoPlaybackFailed: (error?: Error) => void;
    elementAttached: (element: HTMLMediaElement) => void;
    elementDetached: (element: HTMLMediaElement) => void;
    upstreamPaused: (track: any) => void;
    upstreamResumed: (track: any) => void;
    trackProcessorUpdate: (processor?: TrackProcessor<Track.Kind, any>) => void;
    audioTrackFeatureUpdate: (track: any, feature: AudioTrackFeature, enabled: boolean) => void;
    timeSyncUpdate: (update: {
        timestamp: number;
        rtpTimestamp: number;
    }) => void;
};
export {};
//# sourceMappingURL=Track.d.ts.map
