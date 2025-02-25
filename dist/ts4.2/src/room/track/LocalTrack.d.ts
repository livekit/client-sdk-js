import { Mutex } from '@livekit/mutex';
import type { LoggerOptions } from '../types';
import { Track } from './Track';
import type { VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';
import type { ReplaceTrackOptions } from './types';
export default abstract class LocalTrack<TrackKind extends Track.Kind = Track.Kind> extends Track<TrackKind> {
    protected _sender?: RTCRtpSender;
    /** @internal */
    get sender(): RTCRtpSender | undefined;
    /** @internal */
    set sender(sender: RTCRtpSender | undefined);
    /** @internal */
    codec?: VideoCodec;
    get constraints(): MediaTrackConstraints;
    protected _constraints: MediaTrackConstraints;
    protected reacquireTrack: boolean;
    protected providedByUser: boolean;
    protected muteLock: Mutex;
    protected pauseUpstreamLock: Mutex;
    protected processorElement?: HTMLMediaElement;
    protected processor?: TrackProcessor<TrackKind, any>;
    protected processorLock: Mutex;
    protected audioContext?: AudioContext;
    protected manuallyStopped: boolean;
    private restartLock;
    /**
     *
     * @param mediaTrack
     * @param kind
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    protected constructor(mediaTrack: MediaStreamTrack, kind: TrackKind, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, loggerOptions?: LoggerOptions);
    get id(): string;
    get dimensions(): Track.Dimensions | undefined;
    private _isUpstreamPaused;
    get isUpstreamPaused(): boolean;
    get isUserProvided(): boolean;
    get mediaStreamTrack(): MediaStreamTrack;
    get isLocal(): boolean;
    /**
     * @internal
     * returns mediaStreamTrack settings of the capturing mediastreamtrack source - ignoring processors
     */
    getSourceTrackSettings(): MediaTrackSettings;
    private setMediaStreamTrack;
    waitForDimensions(timeout?: number): Promise<Track.Dimensions>;
    setDeviceId(deviceId: ConstrainDOMString): Promise<boolean>;
    abstract restartTrack(constraints?: unknown): Promise<void>;
    /**
     * @returns DeviceID of the device that is currently being used for this track
     */
    getDeviceId(normalize?: boolean): Promise<string | undefined>;
    mute(): Promise<this>;
    unmute(): Promise<this>;
    replaceTrack(track: MediaStreamTrack, options?: ReplaceTrackOptions): Promise<typeof this>;
    replaceTrack(track: MediaStreamTrack, userProvidedTrack?: boolean): Promise<typeof this>;
    protected restart(constraints?: MediaTrackConstraints): Promise<this>;
    protected setTrackMuted(muted: boolean): void;
    protected get needsReAcquisition(): boolean;
    protected handleAppVisibilityChanged(): Promise<void>;
    private handleTrackMuteEvent;
    private debouncedTrackMuteHandler;
    private handleTrackUnmuteEvent;
    private handleEnded;
    stop(): void;
    /**
     * pauses publishing to the server without disabling the local MediaStreamTrack
     * this is used to display a user's own video locally while pausing publishing to
     * the server.
     * this API is unsupported on Safari < 12 due to a bug
     **/
    pauseUpstream(): Promise<void>;
    resumeUpstream(): Promise<void>;
    /**
     * Gets the RTCStatsReport for the LocalTrack's underlying RTCRtpSender
     * See https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport
     *
     * @returns Promise<RTCStatsReport> | undefined
     */
    getRTCStatsReport(): Promise<RTCStatsReport | undefined>;
    /**
     * Sets a processor on this track.
     * See https://github.com/livekit/track-processors-js for example usage
     *
     * @experimental
     *
     * @param processor
     * @param showProcessedStreamLocally
     * @returns
     */
    setProcessor(processor: TrackProcessor<TrackKind>, showProcessedStreamLocally?: boolean): Promise<void>;
    getProcessor(): TrackProcessor<TrackKind, any> | undefined;
    /**
     * Stops the track processor
     * See https://github.com/livekit/track-processors-js for example usage
     *
     * @experimental
     * @returns
     */
    stopProcessor(keepElement?: boolean): Promise<void>;
    protected abstract monitorSender(): void;
}
//# sourceMappingURL=LocalTrack.d.ts.map
