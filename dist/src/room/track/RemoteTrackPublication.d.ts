import { SubscriptionError, TrackInfo } from '@livekit/protocol';
import type { LoggerOptions } from '../types';
import type RemoteTrack from './RemoteTrack';
import { Track, VideoQuality } from './Track';
import { TrackPublication } from './TrackPublication';
export default class RemoteTrackPublication extends TrackPublication {
    track?: RemoteTrack;
    /** @internal */
    protected allowed: boolean;
    protected subscribed?: boolean;
    protected disabled: boolean;
    protected currentVideoQuality?: VideoQuality;
    protected videoDimensions?: Track.Dimensions;
    protected fps?: number;
    protected subscriptionError?: SubscriptionError;
    constructor(kind: Track.Kind, ti: TrackInfo, autoSubscribe: boolean | undefined, loggerOptions?: LoggerOptions);
    /**
     * Subscribe or unsubscribe to this remote track
     * @param subscribed true to subscribe to a track, false to unsubscribe
     */
    setSubscribed(subscribed: boolean): void;
    get subscriptionStatus(): TrackPublication.SubscriptionStatus;
    get permissionStatus(): TrackPublication.PermissionStatus;
    /**
     * Returns true if track is subscribed, and ready for playback
     */
    get isSubscribed(): boolean;
    get isDesired(): boolean;
    get isEnabled(): boolean;
    /**
     * disable server from sending down data for this track. this is useful when
     * the participant is off screen, you may disable streaming down their video
     * to reduce bandwidth requirements
     * @param enabled
     */
    setEnabled(enabled: boolean): void;
    /**
     * for tracks that support simulcasting, adjust subscribed quality
     *
     * This indicates the highest quality the client can accept. if network
     * bandwidth does not allow, server will automatically reduce quality to
     * optimize for uninterrupted video
     */
    setVideoQuality(quality: VideoQuality): void;
    setVideoDimensions(dimensions: Track.Dimensions): void;
    setVideoFPS(fps: number): void;
    get videoQuality(): VideoQuality | undefined;
    /** @internal */
    setTrack(track?: RemoteTrack): void;
    /** @internal */
    setAllowed(allowed: boolean): void;
    /** @internal */
    setSubscriptionError(error: SubscriptionError): void;
    /** @internal */
    updateInfo(info: TrackInfo): void;
    private emitSubscriptionUpdateIfChanged;
    private emitPermissionUpdateIfChanged;
    private isManualOperationAllowed;
    protected handleEnded: (track: RemoteTrack) => void;
    protected get isAdaptiveStream(): boolean;
    protected handleVisibilityChange: (visible: boolean) => void;
    protected handleVideoDimensionsChange: (dimensions: Track.Dimensions) => void;
    emitTrackUpdate(): void;
}
//# sourceMappingURL=RemoteTrackPublication.d.ts.map