import { SubscribedCodec, SubscribedQuality, VideoLayer } from '@livekit/protocol';
import type { SignalClient } from '../../api/SignalClient';
import type { VideoSenderStats } from '../stats';
import type { LoggerOptions } from '../types';
import LocalTrack from './LocalTrack';
import { Track, VideoQuality } from './Track';
import type { VideoCaptureOptions, VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';
export declare class SimulcastTrackInfo {
    codec: VideoCodec;
    mediaStreamTrack: MediaStreamTrack;
    sender?: RTCRtpSender;
    encodings?: RTCRtpEncodingParameters[];
    constructor(codec: VideoCodec, mediaStreamTrack: MediaStreamTrack);
}
export default class LocalVideoTrack extends LocalTrack<Track.Kind.Video> {
    signalClient?: SignalClient;
    private prevStats?;
    private encodings?;
    simulcastCodecs: Map<VideoCodec, SimulcastTrackInfo>;
    private subscribedCodecs?;
    private senderLock;
    private degradationPreference;
    get sender(): RTCRtpSender | undefined;
    set sender(sender: RTCRtpSender | undefined);
    /**
     *
     * @param mediaTrack
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, loggerOptions?: LoggerOptions);
    get isSimulcast(): boolean;
    startMonitor(signalClient: SignalClient): void;
    stop(): void;
    pauseUpstream(): Promise<void>;
    resumeUpstream(): Promise<void>;
    mute(): Promise<typeof this>;
    unmute(): Promise<typeof this>;
    protected setTrackMuted(muted: boolean): void;
    getSenderStats(): Promise<VideoSenderStats[]>;
    setPublishingQuality(maxQuality: VideoQuality): void;
    restartTrack(options?: VideoCaptureOptions): Promise<void>;
    setProcessor(processor: TrackProcessor<Track.Kind.Video>, showProcessedStreamLocally?: boolean): Promise<void>;
    setDegradationPreference(preference: RTCDegradationPreference): Promise<void>;
    addSimulcastTrack(codec: VideoCodec, encodings?: RTCRtpEncodingParameters[]): SimulcastTrackInfo | undefined;
    setSimulcastTrackSender(codec: VideoCodec, sender: RTCRtpSender): void;
    /**
     * @internal
     * Sets codecs that should be publishing, returns new codecs that have not yet
     * been published
     */
    setPublishingCodecs(codecs: SubscribedCodec[]): Promise<VideoCodec[]>;
    /**
     * @internal
     * Sets layers that should be publishing
     */
    setPublishingLayers(qualities: SubscribedQuality[]): Promise<void>;
    protected monitorSender: () => Promise<void>;
    protected handleAppVisibilityChanged(): Promise<void>;
}
export declare function videoQualityForRid(rid: string): VideoQuality;
export declare function videoLayersFromEncodings(width: number, height: number, encodings?: RTCRtpEncodingParameters[], svc?: boolean): VideoLayer[];
//# sourceMappingURL=LocalVideoTrack.d.ts.map