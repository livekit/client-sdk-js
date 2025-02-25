import { ChatMessage as ChatMessageModel, ClientInfo, DisconnectReason, Transcription as TranscriptionModel } from '@livekit/protocol';
import type { ConnectionError } from './errors';
import type LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type RemoteParticipant from './participant/RemoteParticipant';
import type LocalAudioTrack from './track/LocalAudioTrack';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import type LocalVideoTrack from './track/LocalVideoTrack';
import type RemoteAudioTrack from './track/RemoteAudioTrack';
import type RemoteTrack from './track/RemoteTrack';
import type RemoteTrackPublication from './track/RemoteTrackPublication';
import type RemoteVideoTrack from './track/RemoteVideoTrack';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import type { VideoCodec } from './track/options';
import type { ChatMessage, TranscriptionSegment } from './types';
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
export declare function isBrowserSupported(): boolean;
export declare function isFireFox(): boolean;
export declare function isChromiumBased(): boolean;
export declare function isSafari(): boolean;
export declare function isSafari17(): boolean;
export declare function isMobile(): boolean;
export declare function isE2EESimulcastSupported(): boolean | undefined;
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
export declare function isVideoCodec(maybeCodec: string): maybeCodec is VideoCodec;
export declare function unwrapConstraint(constraint: ConstrainDOMString): string;
export declare function unwrapConstraint(constraint: ConstrainULong): number;
export declare function toWebsocketUrl(url: string): string;
export declare function toHttpUrl(url: string): string;
export declare function extractTranscriptionSegments(transcription: TranscriptionModel, firstReceivedTimesMap: Map<string, number>): TranscriptionSegment[];
export declare function extractChatMessage(msg: ChatMessageModel): ChatMessage;
export declare function getDisconnectReasonFromConnectionError(e: ConnectionError): DisconnectReason;
/** convert bigints to numbers preserving undefined values */
export declare function bigIntToNumber<T extends BigInt | undefined>(value: T): T extends BigInt ? number : undefined;
/** convert numbers to bigints preserving undefined values */
export declare function numberToBigInt<T extends number | undefined>(value: T): T extends number ? bigint : undefined;
export declare function isLocalTrack(track: Track | MediaStreamTrack | undefined): track is LocalTrack;
export declare function isAudioTrack(track: Track | undefined): track is LocalAudioTrack | RemoteAudioTrack;
export declare function isVideoTrack(track: Track | undefined): track is LocalVideoTrack | RemoteVideoTrack;
export declare function isLocalVideoTrack(track: Track | MediaStreamTrack | undefined): track is LocalVideoTrack;
export declare function isLocalAudioTrack(track: Track | MediaStreamTrack | undefined): track is LocalAudioTrack;
export declare function isRemoteTrack(track: Track | undefined): track is RemoteTrack;
export declare function isRemotePub(pub: TrackPublication | undefined): pub is RemoteTrackPublication;
export declare function isLocalPub(pub: TrackPublication | undefined): pub is LocalTrackPublication;
export declare function isRemoteVideoTrack(track: Track | undefined): track is RemoteVideoTrack;
export declare function isLocalParticipant(p: Participant): p is LocalParticipant;
export declare function isRemoteParticipant(p: Participant): p is RemoteParticipant;
export declare function splitUtf8(s: string, n: number): Uint8Array[];
//# sourceMappingURL=utils.d.ts.map
