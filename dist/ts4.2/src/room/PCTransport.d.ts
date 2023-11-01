/// <reference types="node" />
import { EventEmitter } from 'events';
/** @internal */
interface TrackBitrateInfo {
    cid?: string;
    transceiver?: RTCRtpTransceiver;
    codec: string;
    maxbr: number;
}
export declare const PCEvents: {
    readonly NegotiationStarted: "negotiationStarted";
    readonly NegotiationComplete: "negotiationComplete";
    readonly RTPVideoPayloadTypes: "rtpVideoPayloadTypes";
};
/** @internal */
export default class PCTransport extends EventEmitter {
    private _pc;
    private get pc();
    pendingCandidates: RTCIceCandidateInit[];
    restartingIce: boolean;
    renegotiate: boolean;
    trackBitrates: TrackBitrateInfo[];
    remoteStereoMids: string[];
    remoteNackMids: string[];
    onOffer?: (offer: RTCSessionDescriptionInit) => void;
    onIceCandidate?: (candidate: RTCIceCandidate) => void;
    onIceCandidateError?: (ev: Event) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onDataChannel?: (ev: RTCDataChannelEvent) => void;
    onTrack?: (ev: RTCTrackEvent) => void;
    constructor(config?: RTCConfiguration, mediaConstraints?: Record<string, unknown>);
    get isICEConnected(): boolean;
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    setRemoteDescription(sd: RTCSessionDescriptionInit): Promise<void>;
    negotiate: {
        (this: unknown, ...args: [
            onError?: ((e: Error) => void) | undefined
        ] & any[]): Promise<void>;
        cancel: (reason?: any) => void;
    };
    createAndSendOffer(options?: RTCOfferOptions): Promise<void>;
    createAndSetAnswer(): Promise<RTCSessionDescriptionInit>;
    createDataChannel(label: string, dataChannelDict: RTCDataChannelInit): RTCDataChannel;
    addTransceiver(mediaStreamTrack: MediaStreamTrack, transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    addTrack(track: MediaStreamTrack): RTCRtpSender;
    setTrackCodecBitrate(info: TrackBitrateInfo): void;
    setConfiguration(rtcConfig: RTCConfiguration): void;
    canRemoveTrack(): boolean;
    removeTrack(sender: RTCRtpSender): void;
    getConnectionState(): RTCPeerConnectionState;
    getICEConnectionState(): RTCIceConnectionState;
    getSignallingState(): RTCSignalingState;
    getTransceivers(): RTCRtpTransceiver[];
    getSenders(): RTCRtpSender[];
    getLocalDescription(): RTCSessionDescription | null;
    getRemoteDescription(): RTCSessionDescription | null;
    getConnectedAddress(): Promise<string | undefined>;
    close(): void;
    private setMungedSDP;
}
export {};
//# sourceMappingURL=PCTransport.d.ts.map
