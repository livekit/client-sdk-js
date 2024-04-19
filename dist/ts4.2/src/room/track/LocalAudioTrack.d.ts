import type { AudioSenderStats } from '../stats';
import type { LoggerOptions } from '../types';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import type { AudioCaptureOptions } from './options';
import type { AudioProcessorOptions, TrackProcessor } from './processor/types';
export default class LocalAudioTrack extends LocalTrack<Track.Kind.Audio> {
    /** @internal */
    stopOnMute: boolean;
    private prevStats?;
    private isKrispNoiseFilterEnabled;
    protected processor?: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined;
    /**
     * boolean indicating whether enhanced noise cancellation is currently being used on this track
     */
    get enhancedNoiseCancellation(): boolean;
    /**
     *
     * @param mediaTrack
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, audioContext?: AudioContext, loggerOptions?: LoggerOptions);
    setDeviceId(deviceId: ConstrainDOMString): Promise<boolean>;
    mute(): Promise<typeof this>;
    unmute(): Promise<typeof this>;
    restartTrack(options?: AudioCaptureOptions): Promise<void>;
    protected restart(constraints?: MediaTrackConstraints): Promise<typeof this>;
    startMonitor(): void;
    protected monitorSender: () => Promise<void>;
    private handleKrispNoiseFilterEnable;
    private handleKrispNoiseFilterDisable;
    setProcessor(processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>): Promise<void>;
    /**
     * @internal
     * @experimental
     */
    setAudioContext(audioContext: AudioContext | undefined): void;
    getSenderStats(): Promise<AudioSenderStats | undefined>;
    checkForSilence(): Promise<boolean>;
}
//# sourceMappingURL=LocalAudioTrack.d.ts.map
