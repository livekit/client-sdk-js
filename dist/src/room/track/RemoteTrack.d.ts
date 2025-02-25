import type { LoggerOptions } from '../types';
import { Track } from './Track';
export default abstract class RemoteTrack<TrackKind extends Track.Kind = Track.Kind> extends Track<TrackKind> {
    /** @internal */
    receiver: RTCRtpReceiver | undefined;
    constructor(mediaTrack: MediaStreamTrack, sid: string, kind: TrackKind, receiver: RTCRtpReceiver, loggerOptions?: LoggerOptions);
    get isLocal(): boolean;
    /** @internal */
    setMuted(muted: boolean): void;
    /** @internal */
    setMediaStream(stream: MediaStream): void;
    start(): void;
    stop(): void;
    /**
     * Gets the RTCStatsReport for the RemoteTrack's underlying RTCRtpReceiver
     * See https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport
     *
     * @returns Promise<RTCStatsReport> | undefined
     */
    getRTCStatsReport(): Promise<RTCStatsReport | undefined>;
    /**
     * Allows to set a playout delay (in seconds) for this track.
     * A higher value allows for more buffering of the track in the browser
     * and will result in a delay of media being played back of `delayInSeconds`
     */
    setPlayoutDelay(delayInSeconds: number): void;
    /**
     * Returns the current playout delay (in seconds) of this track.
     */
    getPlayoutDelay(): number;
    startMonitor(): void;
    protected abstract monitorReceiver(): void;
    registerTimeSyncUpdate(): void;
}
//# sourceMappingURL=RemoteTrack.d.ts.map