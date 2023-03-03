import EventEmitter from 'events';
import { MediaDescription, parse, write } from 'sdp-transform';
import { debounce } from 'ts-debounce';
import log from '../logger';
import { NegotiationError } from './errors';

/** @internal */
interface TrackBitrateInfo {
  sid: string;
  codec: string;
  maxbr: number;
}

export const PCEvents = {
  NegotiationStarted: 'negotiationStarted',
  NegotiationComplete: 'negotiationComplete',
} as const;

/** @internal */
export default class PCTransport extends EventEmitter {
  pc: RTCPeerConnection;

  pendingCandidates: RTCIceCandidateInit[] = [];

  restartingIce: boolean = false;

  renegotiate: boolean = false;

  trackBitrates: TrackBitrateInfo[] = [];

  remoteStereoMids: string[] = [];

  remoteNackMids: string[] = [];

  onOffer?: (offer: RTCSessionDescriptionInit) => void;

  constructor(config?: RTCConfiguration) {
    super();
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
    if (sd.type === 'offer') {
      let { stereoMids, nackMids } = extractStereoAndNackAudioFromOffer(sd);
      this.remoteStereoMids = stereoMids;
      this.remoteNackMids = nackMids;
    }
    await this.pc.setRemoteDescription(sd);

    this.pendingCandidates.forEach((candidate) => {
      this.pc.addIceCandidate(candidate);
    });
    this.pendingCandidates = [];
    this.restartingIce = false;

    if (this.renegotiate) {
      this.renegotiate = false;
      this.createAndSendOffer();
    } else if (sd.type === 'answer') {
      this.emit(PCEvents.NegotiationComplete);
    }
  }

  // debounced negotiate interface
  negotiate = debounce((onError?: (e: Error) => void) => {
    this.emit(PCEvents.NegotiationStarted);
    try {
      this.createAndSendOffer();
    } catch (e) {
      if (onError) {
        onError(e as Error);
      } else {
        throw e;
      }
    }
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
        ensureAudioNackAndStereo(media, [], []);
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
          });

          // add x-google-max-bitrate to fmtp line if not exist
          if (codecPayload > 0) {
            if (
              !media.fmtp.some((fmtp): boolean => {
                if (fmtp.payload === codecPayload) {
                  if (!fmtp.config.includes('x-google-max-bitrate')) {
                    fmtp.config += `;x-google-max-bitrate=${trackbr.maxbr}`;
                  }
                  return true;
                }
                return false;
              })
            ) {
              media.fmtp.push({
                payload: codecPayload,
                config: `x-google-max-bitrate=${trackbr.maxbr}`,
              });
            }
          }

          return true;
        });
      }
    });

    this.trackBitrates = [];

    await this.setMungedLocalDescription(offer, write(sdpParsed));
    this.onOffer(offer);
  }

  async createAndSetAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    const sdpParsed = parse(answer.sdp ?? '');
    sdpParsed.media.forEach((media) => {
      if (media.type === 'audio') {
        ensureAudioNackAndStereo(media, this.remoteStereoMids, this.remoteNackMids);
      }
    });
    await this.setMungedLocalDescription(answer, write(sdpParsed));
    return answer;
  }

  setTrackCodecBitrate(sid: string, codec: string, maxbr: number) {
    this.trackBitrates.push({
      sid,
      codec,
      maxbr,
    });
  }

  close() {
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.close();
  }

  private async setMungedLocalDescription(sd: RTCSessionDescriptionInit, munged: string) {
    const originalSdp = sd.sdp;
    sd.sdp = munged;
    try {
      log.debug('setting munged local description');
      await this.pc.setLocalDescription(sd);
      return;
    } catch (e) {
      log.warn(`not able to set ${sd.type}, falling back to unmodified sdp`, {
        error: e,
      });
      sd.sdp = originalSdp;
    }

    try {
      await this.pc.setLocalDescription(sd);
    } catch (e) {
      // this error cannot always be caught.
      // If the local description has a setCodecPreferences error, this error will be uncaught
      let msg = 'unknown error';
      if (e instanceof Error) {
        msg = e.message;
      } else if (typeof e === 'string') {
        msg = e;
      }
      throw new NegotiationError(msg);
    }
  }
}

function ensureAudioNackAndStereo(
  media: {
    type: string;
    port: number;
    protocol: string;
    payloads?: string | undefined;
  } & MediaDescription,
  stereoMids: string[],
  nackMids: string[],
) {
  // found opus codec to add nack fb
  let opusPayload = 0;
  media.rtp.some((rtp): boolean => {
    if (rtp.codec === 'opus') {
      opusPayload = rtp.payload;
      return true;
    }
    return false;
  });

  // add nack rtcpfb if not exist
  if (opusPayload > 0) {
    if (!media.rtcpFb) {
      media.rtcpFb = [];
    }

    if (
      nackMids.includes(media.mid!) &&
      !media.rtcpFb.some((fb) => fb.payload === opusPayload && fb.type === 'nack')
    ) {
      media.rtcpFb.push({
        payload: opusPayload,
        type: 'nack',
      });
    }

    if (stereoMids.includes(media.mid!)) {
      media.fmtp.some((fmtp): boolean => {
        if (fmtp.payload === opusPayload) {
          if (!fmtp.config.includes('stereo=1')) {
            fmtp.config += ';stereo=1';
          }
          return true;
        }
        return false;
      });
    }
  }
}

function extractStereoAndNackAudioFromOffer(offer: RTCSessionDescriptionInit): {
  stereoMids: string[];
  nackMids: string[];
} {
  const stereoMids: string[] = [];
  const nackMids: string[] = [];
  const sdpParsed = parse(offer.sdp ?? '');
  let opusPayload = 0;
  sdpParsed.media.forEach((media) => {
    if (media.type === 'audio') {
      media.rtp.some((rtp): boolean => {
        if (rtp.codec === 'opus') {
          opusPayload = rtp.payload;
          return true;
        }
        return false;
      });

      if (media.rtcpFb?.some((fb) => fb.payload === opusPayload && fb.type === 'nack')) {
        nackMids.push(media.mid!);
      }

      media.fmtp.some((fmtp): boolean => {
        if (fmtp.payload === opusPayload) {
          if (fmtp.config.includes('sprop-stereo=1')) {
            stereoMids.push(media.mid!);
          }
          return true;
        }
        return false;
      });
    }
  });
  return { stereoMids, nackMids };
}
