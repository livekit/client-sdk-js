import { Mutex } from '../utils';
import { Track } from './Track';
import type { VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';
export default abstract class LocalTrack extends Track {
    /** @internal */
    sender?: RTCRtpSender;
    /** @internal */
    codec?: VideoCodec;
    get constraints(): MediaTrackConstraints;
    protected _constraints: MediaTrackConstraints;
    protected reacquireTrack: boolean;
    protected providedByUser: boolean;
    protected muteLock: Mutex;
    protected pauseUpstreamLock: Mutex;
    protected processorElement?: HTMLMediaElement;
    protected processor?: TrackProcessor<typeof this.kind>;
    protected processorLock: Mutex;
    /**
     *
     * @param mediaTrack
     * @param kind
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    protected constructor(mediaTrack: MediaStreamTrack, kind: Track.Kind, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean);
    get id(): string;
    get dimensions(): Track.Dimensions | undefined;
    private _isUpstreamPaused;
    get isUpstreamPaused(): boolean;
    get isUserProvided(): boolean;
    get mediaStreamTrack(): MediaStreamTrack;
    private setMediaStreamTrack;
    waitForDimensions(timeout?: number): Promise<Track.Dimensions>;
    /**
     * @returns DeviceID of the device that is currently being used for this track
     */
    getDeviceId(): Promise<string | undefined>;
    mute(): Promise<LocalTrack>;
    unmute(): Promise<LocalTrack>;
    replaceTrack(track: MediaStreamTrack, userProvidedTrack?: boolean): Promise<LocalTrack>;
    protected restart(constraints?: MediaTrackConstraints): Promise<LocalTrack>;
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
     * Sets a processor on this track.
     * See https://github.com/livekit/track-processors-js for example usage
     *
     * @experimental
     *
     * @param processor
     * @param showProcessedStreamLocally
     * @returns
     */
    setProcessor(processor: TrackProcessor<typeof this.kind>, showProcessedStreamLocally?: boolean): Promise<void>;
    getProcessor(): TrackProcessor<Track.Kind, import("./processor/types").ProcessorOptions<Track.Kind>> | undefined;
    /**
     * Stops the track processor
     * See https://github.com/livekit/track-processors-js for example usage
     *
     * @experimental
     * @returns
     */
    stopProcessor(): Promise<void>;
    protected abstract monitorSender(): void;
}
//# sourceMappingURL=LocalTrack.d.ts.map