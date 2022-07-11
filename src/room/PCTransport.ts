import { debounce } from 'ts-debounce';
import log from '../logger';

/** @internal */
interface TrackBitrateInfo {
  sid: string;
  codec: string;
  maxbr: number;
}

/** @internal */
export default class PCTransport {
  pc: RTCPeerConnection;

  pendingCandidates: RTCIceCandidateInit[] = [];

  restartingIce: boolean = false;

  renegotiate: boolean = false;

  trackBitrates: TrackBitrateInfo[] = [];

  onOffer?: (offer: RTCSessionDescriptionInit) => void;

  constructor(config?: RTCConfiguration) {
    this.pc = new RTCPeerConnection(config);
  }

  get isICEConnected(): boolean {
    return this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed';
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc.remoteDescription && !this.restartingIce) {
      return this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates.push(candidate);
  }

  async setRemoteDescription(sd: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sd);

    this.pendingCandidates.forEach((candidate) => {
      this.pc.addIceCandidate(candidate);
    });
    this.pendingCandidates = [];
    this.restartingIce = false;

    if (this.renegotiate) {
      this.renegotiate = false;
      this.createAndSendOffer();
    }
  }

  // debounced negotiate interface
  negotiate = debounce(() => {
    this.createAndSendOffer();
  }, 100);

  async createAndSendOffer(options?: RTCOfferOptions) {
    if (this.onOffer === undefined) {
      return;
    }

    if (options?.iceRestart) {
      log.debug('restarting ICE');
      this.restartingIce = true;
    }

    if (this.pc.signalingState === 'have-local-offer') {
      // we're waiting for the peer to accept our offer, so we'll just wait
      // the only exception to this is when ICE restart is needed
      const currentSD = this.pc.remoteDescription;
      if (options?.iceRestart && currentSD) {
        // TODO: handle when ICE restart is needed but we don't have a remote description
        // the best thing to do is to recreate the peerconnection
        await this.pc.setRemoteDescription(currentSD);
      } else {
        this.renegotiate = true;
        return;
      }
    } else if (this.pc.signalingState === 'closed') {
      log.warn('could not createOffer with closed peer connection');
      return;
    }

    // actually negotiate
    log.debug('starting to negotiate');
    const offer = await this.pc.createOffer(options);

    // mung sdp for codec bitrate setting that can't apply by sendEncoding
    this.trackBitrates.forEach((trackbr) => {
      let sdp = offer.sdp ?? '';
      const sidIndex = sdp.search(new RegExp(`msid.* ${trackbr.sid}`));
      if (sidIndex < 0) {
        return;
      }

      const mlineStart = sdp.substring(0, sidIndex).lastIndexOf('m=');
      const mlineEnd = sdp.indexOf('m=', sidIndex);
      const mediaSection = sdp.substring(mlineStart, mlineEnd);

      const mungedMediaSection = mediaSection.replace(
        new RegExp(`a=rtpmap:(\\d+) ${trackbr.codec}/\\d+`, 'i'),
        `$&\r\na=fmtp:$1 x-google-max-bitrate=${trackbr.maxbr}`,
      );
      sdp = sdp.substring(0, mlineStart) + mungedMediaSection + sdp.substring(mlineEnd);
      offer.sdp = sdp;
    });
    this.trackBitrates = [];

    await this.pc.setLocalDescription(offer);
    this.onOffer(offer);
  }

  setTrackCodecBitrate(sid: string, codec: string, maxbr: number) {
    this.trackBitrates.push({
      sid,
      codec,
      maxbr,
    });
  }

  close() {
    this.pc.close();
  }
}
