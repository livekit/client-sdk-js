import { SignalTarget } from '@livekit/protocol';
import PCTransport from './PCTransport';
import type { LoggerOptions } from './types';
export declare enum PCTransportState {
    NEW = 0,
    CONNECTING = 1,
    CONNECTED = 2,
    FAILED = 3,
    CLOSING = 4,
    CLOSED = 5
}
export declare class PCTransportManager {
    publisher: PCTransport;
    subscriber: PCTransport;
    peerConnectionTimeout: number;
    get needsPublisher(): boolean;
    get needsSubscriber(): boolean;
    get currentState(): PCTransportState;
    onStateChange?: (state: PCTransportState, pubState: RTCPeerConnectionState, subState: RTCPeerConnectionState) => void;
    onIceCandidate?: (ev: RTCIceCandidate, target: SignalTarget) => void;
    onDataChannel?: (ev: RTCDataChannelEvent) => void;
    onTrack?: (ev: RTCTrackEvent) => void;
    onPublisherOffer?: (offer: RTCSessionDescriptionInit) => void;
    private isPublisherConnectionRequired;
    private isSubscriberConnectionRequired;
    private state;
    private connectionLock;
    private log;
    private loggerOptions;
    constructor(rtcConfig: RTCConfiguration, subscriberPrimary: boolean, loggerOptions: LoggerOptions);
    private get logContext();
    requirePublisher(require?: boolean): void;
    requireSubscriber(require?: boolean): void;
    createAndSendPublisherOffer(options?: RTCOfferOptions): Promise<void>;
    setPublisherAnswer(sd: RTCSessionDescriptionInit): Promise<void>;
    removeTrack(sender: RTCRtpSender): void | undefined;
    close(): Promise<void>;
    triggerIceRestart(): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget): Promise<void>;
    createSubscriberAnswerFromOffer(sd: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
    updateConfiguration(config: RTCConfiguration, iceRestart?: boolean): void;
    ensurePCTransportConnection(abortController?: AbortController, timeout?: number): Promise<void>;
    negotiate(abortController: AbortController): Promise<void>;
    addPublisherTransceiver(track: MediaStreamTrack, transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    addPublisherTrack(track: MediaStreamTrack): RTCRtpSender;
    createPublisherDataChannel(label: string, dataChannelDict: RTCDataChannelInit): RTCDataChannel;
    /**
     * Returns the first required transport's address if no explicit target is specified
     */
    getConnectedAddress(target?: SignalTarget): Promise<string | undefined>;
    private get requiredTransports();
    private updateState;
    private ensureTransportConnected;
}
//# sourceMappingURL=PCTransportManager.d.ts.map