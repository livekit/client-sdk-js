import { debounce } from 'ts-debounce';
import { parse, write } from 'sdp-transform';
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

    const sdpParsed = parse(offer.sdp ?? '');
    sdpParsed.media.forEach((media) => {
      if (media.type === 'audio') {
        // found opus codec to add nack fb
        let opusPayload = 0
        media.rtp.some((rtp): boolean => {
          if (rtp.codec === 'opus') {
            opusPayload = rtp.payload;
            return true;
          }
          return false;
        })

        // add nack rtcpfb if not exist
        if (opusPayload > 0) {
          if (!media.rtcpFb) {
            media.rtcpFb = [];
          }

          if (!media.rtcpFb.some((fb) => fb.payload === opusPayload && fb.type === 'nack')) {
            media.rtcpFb.push({
              payload: opusPayload,
              type: 'nack',
            });
          }
        }
      } else if (media.type === 'video') {
        // mung sdp for codec bitrate setting that can't apply by sendEncoding
        this.trackBitrates.some((trackbr): boolean => {
          if (!media.msid || !media.msid.includes(trackbr.sid)) {
            return false;
          }

          let codecPayload = 0;
          media.rtp.some((rtp): boolean => {
            if (rtp.codec.toUpperCase() === trackbr.codec.toUpperCase()) {
              codecPayload = rtp.payload;
              return true;
            }
            return false;
          })

          log.debug(`found ${media.msid} for ${trackbr.codec}`);

          // add x-google-max-bitrate to fmtp line if not exist
          if (codecPayload > 0) {
            if (!media.fmtp.some((fmtp): boolean => {
              if (fmtp.payload === codecPayload) {
                if (!fmtp.config.includes('x-google-max-bitrate')) {
                  fmtp.config += `;x-google-max-bitrate=${trackbr.maxbr}`
                }
                return true;
              }
              return false;
            })) {
              media.fmtp.push({
                payload: codecPayload,
                config: `x-google-max-bitrate=${trackbr.maxbr}`,
              })
            }
          }

          return true;
        })
      }
    });

    offer.sdp = write(sdpParsed);

    // this.trackBitrates.forEach((trackbr) => {
    //   let sdp = offer.sdp ?? '';
    //   const sidIndex = sdp.search(new RegExp(`msid.* ${trackbr.sid}`));
    //   if (sidIndex < 0) {
    //     return;
    //   }

    //   const mlineStart = sdp.substring(0, sidIndex).lastIndexOf('m=');
    //   const mlineEnd = sdp.indexOf('m=', sidIndex);
    //   const mediaSection = sdp.substring(mlineStart, mlineEnd);

    //   const mungedMediaSection = mediaSection.replace(
    //     new RegExp(`a=rtpmap:(\\d+) ${trackbr.codec}/\\d+`, 'i'),
    //     '$'.concat(`&\r\na=fmtp:$1 x-google-max-bitrate=${trackbr.maxbr}`), // Unity replaces '$&' by some random values when building ( Using concat as a workaround )
    //   );
    //   sdp = sdp.substring(0, mlineStart) + mungedMediaSection + sdp.substring(mlineEnd);
    //   offer.sdp = sdp;
    // });
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
