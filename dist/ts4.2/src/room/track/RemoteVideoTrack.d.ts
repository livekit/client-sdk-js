import type { VideoReceiverStats } from '../stats';
import type { LoggerOptions } from '../types';
import RemoteTrack from './RemoteTrack';
import { Track } from './Track';
import type { AdaptiveStreamSettings } from './types';
export default class RemoteVideoTrack extends RemoteTrack<Track.Kind.Video> {
    private prevStats?;
    private elementInfos;
    private adaptiveStreamSettings?;
    private lastVisible?;
    private lastDimensions?;
    constructor(mediaTrack: MediaStreamTrack, sid: string, receiver: RTCRtpReceiver, adaptiveStreamSettings?: AdaptiveStreamSettings, loggerOptions?: LoggerOptions);
    get isAdaptiveStream(): boolean;
    /**
     * Note: When using adaptiveStream, you need to use remoteVideoTrack.attach() to add the track to a HTMLVideoElement, otherwise your video tracks might never start
     */
    get mediaStreamTrack(): MediaStreamTrack;
    /** @internal */
    setMuted(muted: boolean): void;
    attach(): HTMLMediaElement;
    attach(element: HTMLMediaElement): HTMLMediaElement;
    /**
     * Observe an ElementInfo for changes when adaptive streaming.
     * @param elementInfo
     * @internal
     */
    observeElementInfo(elementInfo: ElementInfo): void;
    /**
     * Stop observing an ElementInfo for changes.
     * @param elementInfo
     * @internal
     */
    stopObservingElementInfo(elementInfo: ElementInfo): void;
    detach(): HTMLMediaElement[];
    detach(element: HTMLMediaElement): HTMLMediaElement;
    /** @internal */
    getDecoderImplementation(): string | undefined;
    protected monitorReceiver: () => Promise<void>;
    getReceiverStats(): Promise<VideoReceiverStats | undefined>;
    private stopObservingElement;
    protected handleAppVisibilityChanged(): Promise<void>;
    private readonly debouncedHandleResize;
    private updateVisibility;
    private updateDimensions;
    private getPixelDensity;
}
export interface ElementInfo {
    element: object;
    width(): number;
    height(): number;
    visible: boolean;
    pictureInPicture: boolean;
    visibilityChangedAt: number | undefined;
    handleResize?: () => void;
    handleVisibilityChanged?: () => void;
    observe(): void;
    stopObserving(): void;
}
//# sourceMappingURL=RemoteVideoTrack.d.ts.map
