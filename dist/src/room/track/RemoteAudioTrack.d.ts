import type { AudioReceiverStats } from '../stats';
import type { LoggerOptions } from '../types';
import RemoteTrack from './RemoteTrack';
import { Track } from './Track';
import type { AudioOutputOptions } from './options';
export default class RemoteAudioTrack extends RemoteTrack<Track.Kind.Audio> {
    private prevStats?;
    private elementVolume;
    private audioContext?;
    private gainNode?;
    private sourceNode?;
    private webAudioPluginNodes;
    private sinkId?;
    constructor(mediaTrack: MediaStreamTrack, sid: string, receiver: RTCRtpReceiver, audioContext?: AudioContext, audioOutput?: AudioOutputOptions, loggerOptions?: LoggerOptions);
    /**
     * sets the volume for all attached audio elements
     */
    setVolume(volume: number): void;
    /**
     * gets the volume of attached audio elements (loudest)
     */
    getVolume(): number;
    /**
     * calls setSinkId on all attached elements, if supported
     * @param deviceId audio output device
     */
    setSinkId(deviceId: string): Promise<void>;
    attach(): HTMLMediaElement;
    attach(element: HTMLMediaElement): HTMLMediaElement;
    /**
     * Detaches from all attached elements
     */
    detach(): HTMLMediaElement[];
    /**
     * Detach from a single element
     * @param element
     */
    detach(element: HTMLMediaElement): HTMLMediaElement;
    /**
     * @internal
     * @experimental
     */
    setAudioContext(audioContext: AudioContext | undefined): void;
    /**
     * @internal
     * @experimental
     * @param {AudioNode[]} nodes - An array of WebAudio nodes. These nodes should not be connected to each other when passed, as the sdk will take care of connecting them in the order of the array.
     */
    setWebAudioPlugins(nodes: AudioNode[]): void;
    private connectWebAudio;
    private disconnectWebAudio;
    protected monitorReceiver: () => Promise<void>;
    getReceiverStats(): Promise<AudioReceiverStats | undefined>;
}
//# sourceMappingURL=RemoteAudioTrack.d.ts.map