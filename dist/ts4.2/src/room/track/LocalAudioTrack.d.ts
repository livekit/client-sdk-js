import type { AudioSenderStats } from '../stats';
import LocalTrack from './LocalTrack';
import type { AudioCaptureOptions } from './options';
import type { TrackProcessor } from './processor/types';
export default class LocalAudioTrack extends LocalTrack {
    /** @internal */
    stopOnMute: boolean;
    private audioContext?;
    private prevStats?;
    /**
     *
     * @param mediaTrack
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, audioContext?: AudioContext);
    setDeviceId(deviceId: ConstrainDOMString): Promise<boolean>;
    mute(): Promise<LocalAudioTrack>;
    unmute(): Promise<LocalAudioTrack>;
    restartTrack(options?: AudioCaptureOptions): Promise<void>;
    protected restart(constraints?: MediaTrackConstraints): Promise<LocalTrack>;
    startMonitor(): void;
    protected monitorSender: () => Promise<void>;
    setProcessor(processor: TrackProcessor<typeof this.kind>): Promise<void>;
    /**
     * @internal
     * @experimental
     */
    setAudioContext(audioContext: AudioContext | undefined): void;
    getSenderStats(): Promise<AudioSenderStats | undefined>;
    checkForSilence(): Promise<boolean>;
}
//# sourceMappingURL=LocalAudioTrack.d.ts.map
