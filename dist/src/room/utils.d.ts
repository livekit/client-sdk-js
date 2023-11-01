import { ClientInfo } from '../proto/livekit_models_pb';
import type LocalAudioTrack from './track/LocalAudioTrack';
import type RemoteAudioTrack from './track/RemoteAudioTrack';
import { VideoCodec } from './track/options';
export declare const ddExtensionURI = "https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension";
export declare function unpackStreamId(packed: string): string[];
export declare function sleep(duration: number): Promise<void>;
/** @internal */
export declare function supportsTransceiver(): boolean;
/** @internal */
export declare function supportsAddTrack(): boolean;
export declare function supportsAdaptiveStream(): boolean;
export declare function supportsDynacast(): boolean;
export declare function supportsAV1(): boolean;
export declare function supportsVP9(): boolean;
export declare function isSVCCodec(codec?: string): boolean;
export declare function supportsSetSinkId(elm?: HTMLMediaElement): boolean;
export declare function supportsSetCodecPreferences(transceiver: RTCRtpTransceiver): boolean;
export declare function isBrowserSupported(): boolean;
export declare function isFireFox(): boolean;
export declare function isChromiumBased(): boolean;
export declare function isSafari(): boolean;
export declare function isMobile(): boolean;
export declare function isWeb(): boolean;
export declare function isReactNative(): boolean;
export declare function isCloud(serverUrl: URL): boolean;
export declare function getReactNativeOs(): string | undefined;
export declare function getDevicePixelRatio(): number;
export declare function compareVersions(v1: string, v2: string): number;
export declare const getResizeObserver: () => ResizeObserver;
export declare const getIntersectionObserver: () => IntersectionObserver;
export interface ObservableMediaElement extends HTMLMediaElement {
    handleResize: (entry: ResizeObserverEntry) => void;
    handleVisibilityChanged: (entry: IntersectionObserverEntry) => void;
}
export declare function getClientInfo(): ClientInfo;
export declare function getEmptyVideoStreamTrack(): MediaStreamTrack;
export declare function createDummyVideoStreamTrack(width?: number, height?: number, enabled?: boolean, paintContent?: boolean): MediaStreamTrack;
export declare function getEmptyAudioStreamTrack(): MediaStreamTrack;
export declare class Future<T> {
    promise: Promise<T>;
    resolve?: (arg: T) => void;
    reject?: (e: any) => void;
    onFinally?: () => void;
    constructor(futureBase?: (resolve: (arg: T) => void, reject: (e: any) => void) => void, onFinally?: () => void);
}
export type AudioAnalyserOptions = {
    /**
     * If set to true, the analyser will use a cloned version of the underlying mediastreamtrack, which won't be impacted by muting the track.
     * Useful for local tracks when implementing things like "seems like you're muted, but trying to speak".
     * Defaults to false
     */
    cloneTrack?: boolean;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize
     */
    fftSize?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant
     */
    smoothingTimeConstant?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/minDecibels
     */
    minDecibels?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/maxDecibels
     */
    maxDecibels?: number;
};
/**
 * Creates and returns an analyser web audio node that is attached to the provided track.
 * Additionally returns a convenience method `calculateVolume` to perform instant volume readings on that track.
 * Call the returned `cleanup` function to close the audioContext that has been created for the instance of this helper
 */
export declare function createAudioAnalyser(track: LocalAudioTrack | RemoteAudioTrack, options?: AudioAnalyserOptions): {
    calculateVolume: () => number;
    analyser: AnalyserNode;
    cleanup: () => Promise<void>;
};
export declare class Mutex {
    private _locking;
    private _locks;
    constructor();
    isLocked(): boolean;
    lock(): Promise<() => void>;
}
export declare function isVideoCodec(maybeCodec: string): maybeCodec is VideoCodec;
export declare function unwrapConstraint(constraint: ConstrainDOMString): string;
export declare function toWebsocketUrl(url: string): string;
export declare function toHttpUrl(url: string): string;
//# sourceMappingURL=utils.d.ts.map