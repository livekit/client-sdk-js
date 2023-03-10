import log from '../../logger';
import RemoteAudioTrack from "./RemoteAudioTrack";
import type { AudioOutputOptions } from './options';

export default class MuxedRemoteAudioTrack extends RemoteAudioTrack {
    private audioCtx: AudioContext;

    private streamDst: MediaStreamAudioDestinationNode;

    private streamDstTrack: MediaStreamTrack;

    private muxingTrack?: MediaStreamTrack;

    private muxingSourceNode?: AudioNode;

    private audioForWebRTCStream?: HTMLAudioElement;

    constructor(
        sid: string,
        mediaTrack?: MediaStreamTrack,
        mediaStream?: MediaStream,
        receiver?: RTCRtpReceiver,
        audioContext?: AudioContext,
        audioOutput?: AudioOutputOptions,
    ) {
        if (!audioContext) {
            audioContext = new AudioContext()
        }
        const dst = audioContext.createMediaStreamDestination();
        // const dst = audioContext.destination;
        const [streamDstTrack] = dst.stream.getAudioTracks();
        if (!streamDstTrack) {
            throw Error('Could not get media stream audio track');
        }
        super(streamDstTrack, sid, receiver, audioContext, audioOutput);
        this.audioCtx = audioContext;
        this.streamDst = dst;
        this.streamDstTrack = streamDstTrack;
        this.audioForWebRTCStream = new Audio();
        // this.streamDst.connect(audioContext.destination);

        if (mediaTrack && mediaStream) {
            this.bind(mediaTrack, mediaStream, receiver);
        }
        this.setMediaStream(dst.stream);
    }

    bind(track: MediaStreamTrack, stream: MediaStream, receiver?: RTCRtpReceiver) {
        if (track === this.muxingTrack) {
            return;
        }
        if (this.muxingSourceNode) {
            this.muxingSourceNode.disconnect();
        }
        log.info(`bind ${this.sid}`);

        // for chrome known bug: webrtc stream must attach to an element to play.
        // https://bugs.chromium.org/p/chromium/issues/detail?id=933677&q=webrtc%20silent&can=2
        if (this.audioForWebRTCStream) {
            this.audioForWebRTCStream.srcObject = stream;
        }

        const srcNode = this.audioCtx.createMediaStreamSource(stream);
        srcNode.connect(this.streamDst);
        this.muxingSourceNode = srcNode;
        this.muxingTrack = track;
        this.receiver = receiver;
        // this.streamDstTrack.enabled = true;
    }

    unbind() {
        if (this.muxingSourceNode) {
            log.info(`unbind ${this.sid}`);
            this.muxingSourceNode?.disconnect();
            this.muxingSourceNode = undefined;
            this.muxingTrack = undefined;
            this.receiver = undefined;
        }
        // this.streamDstTrack.enabled = false;
    }

    close() {
        this.unbind();
        // fire onremovetrack for Track Ended event
        this.streamDst.stream.removeTrack(this.streamDstTrack);
    }
}