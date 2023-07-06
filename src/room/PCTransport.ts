import EventEmitter from 'eventemitter3';
import { parse, write } from 'sdp-transform';
import type { MediaDescription } from 'sdp-transform';
import { debounce } from 'ts-debounce';
import log from '../logger';
import { NegotiationError, UnexpectedConnectionState } from './errors';
import { ddExtensionURI, isChromiumBased, isSVCCodec } from './utils';

/** @internal */
interface TrackBitrateInfo {
  cid?: string;
  transceiver?: RTCRtpTransceiver;
  codec: string;
  maxbr: number;
}

/* The svc codec (av1/vp9) would use a very low bitrate at the begining and
increase slowly by the bandwidth estimator until it reach the target bitrate. The
process commonly cost more than 10 seconds cause subscriber will get blur video at 
the first few seconds. So we use a 70% of target bitrate here as the start bitrate to
eliminate this issue.
*/
const startBitrateForSVC = 0.7;

export const PCEvents = {
  NegotiationStarted: 'negotiationStarted',
  NegotiationComplete: 'negotiationComplete',
  RTPVideoPayloadTypes: 'rtpVideoPayloadTypes',
} as const;

/** @internal */
export default class PCTransport extends EventEmitter {
  private _pc: RTCPeerConnection | null;

  public get pc() {
    if (this._pc) return this._pc;
    throw new UnexpectedConnectionState('Expected peer connection to be available');
  }

  pendingCandidates: RTCIceCandidateInit[] = [];

  restartingIce: boolean = false;

  renegotiate: boolean = false;

  trackBitrates: TrackBitrateInfo[] = [];

  remoteStereoMids: string[] = [];

  remoteNackMids: string[] = [];

  onOffer?: (offer: RTCSessionDescriptionInit) => void;

  constructor(config?: RTCConfiguration, mediaConstraints: Record<string, unknown> = {}) {
    super();
    this._pc = isChromiumBased()
      ? // @ts-expect-error chrome allows additional media constraints to be passed into the RTCPeerConnection constructor
        new RTCPeerConnection(config, mediaConstraints)
      : new RTCPeerConnection(config);
  }

  get isICEConnected(): boolean {
    return (
      this._pc !== null &&
      (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed')
    );
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc.remoteDescription && !this.restartingIce) {
      return this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates.push(candidate);
  }

  async setRemoteDescription(sd: RTCSessionDescriptionInit): Promise<void> {
    let mungedSDP: string | undefined = undefined;
    if (sd.type === 'offer') {
      let { stereoMids, nackMids } = extractStereoAndNackAudioFromOffer(sd);
      this.remoteStereoMids = stereoMids;
      this.remoteNackMids = nackMids;
    } else if (sd.type === 'answer') {
      const sdpParsed = parse(sd.sdp ?? '');
      sdpParsed.media.forEach((media) => {
        if (media.type === 'audio') {
          // mung sdp for opus bitrate settings
          this.trackBitrates.some((trackbr): boolean => {
            if (!trackbr.transceiver || media.mid != trackbr.transceiver.mid) {
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

            if (codecPayload === 0) {
              return true;
            }

            let fmtpFound = false;
            for (const fmtp of media.fmtp) {
              if (fmtp.payload === codecPayload) {
                fmtp.config = fmtp.config
                  .split(';')
                  .filter((attr) => !attr.includes('maxaveragebitrate'))
                  .join(';');
                if (trackbr.maxbr > 0) {
                  fmtp.config += `;maxaveragebitrate=${trackbr.maxbr * 1000}`;
                }
                fmtpFound = true;
                break;
              }
            }

            if (!fmtpFound) {
              if (trackbr.maxbr > 0) {
                media.fmtp.push({
                  payload: codecPayload,
                  config: `maxaveragebitrate=${trackbr.maxbr * 1000}`,
                });
              }
            }

            return true;
          });
        }
      });
      mungedSDP = write(sdpParsed);
    }
    await this.setMungedSDP(sd, mungedSDP, true);

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
      if (sd.sdp) {
        const sdpParsed = parse(sd.sdp);
        sdpParsed.media.forEach((media) => {
          if (media.type === 'video') {
            this.emit(PCEvents.RTPVideoPayloadTypes, media.rtp);
          }
        });
      }
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

    if (this._pc && this._pc.signalingState === 'have-local-offer') {
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
    } else if (!this._pc || this._pc.signalingState === 'closed') {
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
        ensureVideoDDExtensionForSVC(media);
        // mung sdp for codec bitrate setting that can't apply by sendEncoding
        this.trackBitrates.some((trackbr): boolean => {
          if (!media.msid || !trackbr.cid || !media.msid.includes(trackbr.cid)) {
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

          if (codecPayload === 0) {
            return true;
          }

          let fmtpFound = false;
          for (const fmtp of media.fmtp) {
            if (fmtp.payload === codecPayload) {
              if (!fmtp.config.includes('x-google-start-bitrate')) {
                fmtp.config += `;x-google-start-bitrate=${trackbr.maxbr * startBitrateForSVC}`;
              }
              if (!fmtp.config.includes('x-google-max-bitrate')) {
                fmtp.config += `;x-google-max-bitrate=${trackbr.maxbr}`;
              }
              fmtpFound = true;
              break;
            }
          }

          if (!fmtpFound) {
            media.fmtp.push({
              payload: codecPayload,
              config: `x-google-start-bitrate=${
                trackbr.maxbr * startBitrateForSVC
              };x-google-max-bitrate=${trackbr.maxbr}`,
            });
          }

          return true;
        });
      }
    });

    await this.setMungedSDP(offer, write(sdpParsed));
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
    await this.setMungedSDP(answer, write(sdpParsed));
    return answer;
  }

  setTrackCodecBitrate(info: TrackBitrateInfo) {
    this.trackBitrates.push(info);
  }

  close() {
    if (!this._pc) {
      return;
    }
    this._pc.close();
    this._pc.onconnectionstatechange = null;
    this._pc.oniceconnectionstatechange = null;
    this._pc.onicegatheringstatechange = null;
    this._pc.ondatachannel = null;
    this._pc.onnegotiationneeded = null;
    this._pc.onsignalingstatechange = null;
    this._pc.onicecandidate = null;
    this._pc.ondatachannel = null;
    this._pc.ontrack = null;
    this._pc.onconnectionstatechange = null;
    this._pc.oniceconnectionstatechange = null;
    this._pc = null;
  }

  private async setMungedSDP(sd: RTCSessionDescriptionInit, munged?: string, remote?: boolean) {
    if (munged) {
      const originalSdp = sd.sdp;
      sd.sdp = munged;
      try {
        log.debug(`setting munged ${remote ? 'remote' : 'local'} description`);
        if (remote) {
          await this.pc.setRemoteDescription(sd);
        } else {
          await this.pc.setLocalDescription(sd);
        }
        return;
      } catch (e) {
        log.warn(`not able to set ${sd.type}, falling back to unmodified sdp`, {
          error: e,
        });
        sd.sdp = originalSdp;
      }
    }

    try {
      if (remote) {
        await this.pc.setRemoteDescription(sd);
      } else {
        await this.pc.setLocalDescription(sd);
      }
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

function ensureVideoDDExtensionForSVC(
  media: {
    type: string;
    port: number;
    protocol: string;
    payloads?: string | undefined;
  } & MediaDescription,
) {
  const codec = media.rtp[0]?.codec?.toLowerCase();
  if (!isSVCCodec(codec)) {
    return;
  }

  let maxID = 0;
  const ddFound = media.ext?.some((ext): boolean => {
    if (ext.uri === ddExtensionURI) {
      return true;
    }
    if (ext.value > maxID) {
      maxID = ext.value;
    }
    return false;
  });

  if (!ddFound) {
    media.ext?.push({
      value: maxID + 1,
      uri: ddExtensionURI,
    });
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
