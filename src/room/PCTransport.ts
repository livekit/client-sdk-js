import { EventEmitter } from 'events';
import * as SDPUtils from 'sdp';
import { debounce } from 'ts-debounce';
import log from '../logger';
import { NegotiationError } from './errors';
import { ddExtensionURI, isChromiumBased, isSVCCodec } from './utils';

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

  constructor(config?: RTCConfiguration, mediaConstraints: Record<string, unknown> = {}) {
    super();
    this.pc = isChromiumBased()
      ? // @ts-expect-error chrome allows additional media constraints to be passed into the RTCPeerConnection constructor
        new RTCPeerConnection(config, mediaConstraints)
      : new RTCPeerConnection(config);
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

    const mediaSections = parseSdpMediaSections(offer.sdp);
    mediaSections.forEach((media) => {
      if (media.mLine.kind === 'audio') {
        ensureAudioNackAndStereo(media, [], []);
      } else if (media.mLine.kind === 'video') {
        ensureVideoDDExtensionForSVC(media);
        // mung sdp for codec bitrate setting that can't apply by sendEncoding
        this.trackBitrates.some((trackbr): boolean => {
          if (!media.msid.track || media.msid.track !== trackbr.sid) {
            return false;
          }

          return media.rtp.codecs.some((codec): boolean => {
            if (codec.name.toUpperCase() === trackbr.codec.toUpperCase()) {
              // add x-google-max-bitrate to fmtp line if not exist
              if (!codec.parameters?.['x-google-max-bitrate']) {
                codec.parameters = {
                  ...codec.parameters,
                  'x-google-max-bitrate': trackbr.maxbr.toFixed(0),
                };
              }
              return true;
            }
            return false;
          });
        });
      }
    });

    this.trackBitrates = [];

    await this.setMungedLocalDescription(offer, write(sdpParsed));
    this.onOffer(offer);
  }

  async createAndSetAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    const mediaSections = parseSdpMediaSections(answer.sdp);
    mediaSections.forEach((media) => {
      if (media.mLine.kind === 'audio') {
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
  media: SDPMediaSection,
  stereoMids: string[],
  nackMids: string[],
) {
  const opus = media.rtp.codecs.find((codec): boolean => {
    if (codec.name === 'opus') {
      return true;
    }
    return false;
  });

  // add nack rtcpFeedback if not exist
  if (typeof opus !== 'undefined') {
    if (!opus.rtcpFeedback) {
      opus.rtcpFeedback = [];
    }

    if (nackMids.includes(media.mid!) && !opus.rtcpFeedback.some((fb) => fb.type === 'nack')) {
      opus.rtcpFeedback.push({
        type: 'nack',
        parameter: '',
      });
    }

    if (stereoMids.includes(media.mid!)) {
      opus.parameters ??= {};
      if (opus.parameters.stereo !== '1') {
        opus.parameters.stereo = '1';
      }
      return true;
    }
    return false;
  }
}

function ensureVideoDDExtensionForSVC(media: SDPMediaSection) {
  const codec = media.rtp.codecs[0].name.toLowerCase();
  if (!isSVCCodec(codec)) {
    return;
  }

  let maxID = 0;
  const ddFound = media.rtp.headerExtensions?.some((ext): boolean => {
    if (ext.uri === ddExtensionURI) {
      return true;
    }
    if (ext.id > maxID) {
      maxID = ext.id;
    }
    return false;
  });

  if (!ddFound) {
    media.rtp.headerExtensions?.push({
      id: maxID + 1,
      uri: ddExtensionURI,
      atrributes: '',
    });
  }
}

function extractStereoAndNackAudioFromOffer(offer: RTCSessionDescriptionInit): {
  stereoMids: string[];
  nackMids: string[];
} {
  const stereoMids: string[] = [];
  const nackMids: string[] = [];
  const sdpMedia = parseSdpMediaSections(offer.sdp);
  sdpMedia.forEach((media) => {
    if (media.mLine.kind === 'audio') {
      const opus = media.rtp.codecs.find((codec): boolean => codec.name === 'opus');
      if (!opus) {
        return;
      }

      if (opus.rtcpFeedback?.some((fb) => fb.type === 'nack')) {
        nackMids.push(media.mid!);
      }

      if (opus.parameters?.['sprop-stereo'] === '1') {
        stereoMids.push(media.mid!);
      }
      return true;
    }
    return false;
  });
  return { stereoMids, nackMids };
}

function parseSdpMediaSections(blob?: string) {
  return SDPUtils.getMediaSections(blob ?? '').map((section) => {
    return {
      mLine: SDPUtils.parseMLine(section),
      rtp: SDPUtils.parseRtpParameters(section),
      mid: SDPUtils.getMid(section),
      msid: SDPUtils.parseMsid(section),
    } satisfies SDPMediaSection;
  });
}

type SDPMediaSection = {
  mLine: SDPUtils.SDPMLine;
  rtp: SDPUtils.SDPRtpCapabilities;
  mid: string;
  msid: SDPUtils.SDPMediaStreamId;
};
