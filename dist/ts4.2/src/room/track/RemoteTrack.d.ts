import { Track } from './Track';
export default abstract class RemoteTrack extends Track {
    /** @internal */
    receiver?: RTCRtpReceiver;
    constructor(mediaTrack: MediaStreamTrack, sid: string, kind: Track.Kind, receiver?: RTCRtpReceiver);
    /** @internal */
    setMuted(muted: boolean): void;
    /** @internal */
    setMediaStream(stream: MediaStream): void;
    start(): void;
    stop(): void;
    startMonitor(): void;
    protected abstract monitorReceiver(): void;
}
//# sourceMappingURL=RemoteTrack.d.ts.map
