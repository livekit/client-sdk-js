import type TypedEventEmitter from 'typed-emitter';
import type { SignalClient } from '../../api/SignalClient';
import { TrackSource, TrackType } from '../../proto/livekit_models_pb';
import { StreamState as ProtoStreamState } from '../../proto/livekit_rtc_pb';
declare const Track_base: new () => TypedEventEmitter<TrackEventCallbacks>;
export declare abstract class Track extends Track_base {
    kind: Track.Kind;
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
    protected _mediaStreamTrack: MediaStreamTrack;
    protected _mediaStreamID: string;
    protected isInBackground: boolean;
    private backgroundTimeout;
    protected _currentBitrate: number;
    protected monitorInterval?: ReturnType<typeof setInterval>;
    protected constructor(mediaTrack: MediaStreamTrack, kind: Track.Kind);
    /** current receive bits per second */
    get currentBitrate(): number;
    get mediaStreamTrack(): MediaStreamTrack;
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
    private recycleElement;
    protected appVisibilityChangedListener: () => void;
    protected handleAppVisibilityChanged(): Promise<void>;
    protected addAppVisibilityListener(): void;
    protected removeAppVisibilityListener(): void;
}
/** @internal */
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
    audioPlaybackFailed: (error: Error) => void;
    audioSilenceDetected: () => void;
    visibilityChanged: (visible: boolean, track?: any) => void;
    videoDimensionsChanged: (dimensions: Track.Dimensions, track?: any) => void;
    elementAttached: (element: HTMLMediaElement) => void;
    elementDetached: (element: HTMLMediaElement) => void;
    upstreamPaused: (track: any) => void;
    upstreamResumed: (track: any) => void;
};
export {};
//# sourceMappingURL=Track.d.ts.map
