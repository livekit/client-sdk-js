import type { MediaAttributes } from 'sdp-transform';
import log from '../logger';
import { DataPacket_Kind } from '../proto/livekit_models_pb';
import { SignalTarget } from '../proto/livekit_rtc_pb';
import PCTransport, { PCEvents } from './PCTransport';
import { ConnectionError, NegotiationError, UnexpectedConnectionState } from './errors';
import type LocalTrack from './track/LocalTrack';
import type { SimulcastTrackInfo } from './track/LocalVideoTrack';
import type LocalVideoTrack from './track/LocalVideoTrack';
import { Track } from './track/Track';
import type { TrackPublishOptions, VideoCodec } from './track/options';
import {
  isVideoCodec,
  sleep,
  supportsAddTrack,
  supportsSetCodecPreferences,
  supportsTransceiver,
} from './utils';

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';

const minReconnectWait = 2 * 1000;

enum PCState {
  New,
  Connected,
  Disconnected,
  Reconnecting,
  Closed,
}

export class TransportManager {
  publisher?: PCTransport;

  subscriber?: PCTransport;

  onICECandidate?: (candidate: RTCIceCandidate, target: SignalTarget) => void;

  onPublisherOffer?: (offer: RTCSessionDescriptionInit) => void;

  onRemoteTrack?: (ev: RTCTrackEvent) => void;

  onDataMessage?: (message: MessageEvent) => void;

  onBufferedAmountLow?: (kind: DataPacket_Kind) => void;

  private pcState: PCState = PCState.New;

  private needsSubscriber: boolean;

  private needsPublisher: boolean;

  private lossyDC?: RTCDataChannel;

  private lossyDCSub?: RTCDataChannel;

  private reliableDC?: RTCDataChannel;

  private dcBufferStatus: Map<DataPacket_Kind, boolean>;

  private peerConnectionTimeout: number;

  // @ts-ignore noUnusedLocals
  private reliableDCSub?: RTCDataChannel;

  constructor(
    config: RTCConfiguration,
    needsSubscriber: boolean,
    needsPublisher: boolean,
    peerConnectionTimeout: number,
  ) {
    this.needsSubscriber = needsSubscriber;
    this.needsPublisher = needsPublisher;
    this.peerConnectionTimeout = peerConnectionTimeout;

    if (needsPublisher) {
      this.publisher = this.createPublisher(config);
    }
    if (needsSubscriber) {
      this.subscriber = this.createSubscriber(config);
    }
  }

  async createSender(
    track: LocalTrack,
    opts: TrackPublishOptions,
    encodings?: RTCRtpEncodingParameters[],
  ) {
    if (supportsTransceiver()) {
      const sender = await this.createTransceiverRTCRtpSender(track, opts, encodings);
      return sender;
    }
    if (supportsAddTrack()) {
      log.warn('using add-track fallback');
      const sender = await this.createRTCRtpSender(track.mediaStreamTrack);
      return sender;
    }
    throw new UnexpectedConnectionState('Required webRTC APIs not supported on this device');
  }

  async createSimulcastSender(
    track: LocalVideoTrack,
    simulcastTrack: SimulcastTrackInfo,
    opts: TrackPublishOptions,
    encodings?: RTCRtpEncodingParameters[],
  ) {
    // store RTCRtpSender
    if (supportsTransceiver()) {
      return this.createSimulcastTransceiverSender(track, simulcastTrack, opts, encodings);
    }
    if (supportsAddTrack()) {
      log.debug('using add-track fallback');
      return this.createRTCRtpSender(track.mediaStreamTrack);
    }

    throw new UnexpectedConnectionState('Cannot stream on this device');
  }

  async waitForDataTransportConnected(kind: DataPacket_Kind, subscriber = this.needsSubscriber) {
    const transport = subscriber ? this.subscriber : this.publisher;

    const targetChannel = this.getDataChannelForKind(kind, subscriber);
    if (targetChannel?.readyState === 'open') {
      return;
    }

    // wait until ICE connected
    const endTime = new Date().getTime() + this.peerConnectionTimeout;
    while (new Date().getTime() < endTime) {
      if (
        transport?.isICEConnected &&
        this.getDataChannelForKind(kind, subscriber)?.readyState === 'open'
      ) {
        return;
      }
      await sleep(50);
    }

    throw new ConnectionError(
      `could not establish ${subscriber ? 'subscriber' : 'publisher'} connection, state: ${
        transport?.pc.iceConnectionState
      }`,
    );
  }

  async resumeTransports() {
    if (this.needsSubscriber) {
      if (!this.subscriber) {
        throw new ConnectionError('Could not resume subscriber, missing');
      }
      this.subscriber.restartingIce = true;
    }

    // only restart publisher if it's needed
    if (this.needsPublisher) {
      if (!this.publisher) {
        throw new ConnectionError('Could not resume publisher, missing');
      }
      await this.publisher.createAndSendOffer({ iceRestart: true });
    }
    await this.waitForPCReconnected();
  }

  async waitForPCReconnected() {
    const startTime = Date.now();
    let now = startTime;
    this.pcState = PCState.Reconnecting;

    log.debug('waiting for peer connections to reconnect');
    while (now - startTime < this.peerConnectionTimeout) {
      const requiredTransports = this.getRequiredTransports();
      if (!requiredTransports) {
        // we can abort early, connection is hosed
        break;
      } else if (
        // on Safari, we don't get a connectionstatechanged event during ICE restart
        // this means we'd have to check its status manually and update address
        // manually
        now - startTime > minReconnectWait &&
        requiredTransports.every((pc) => pc.pc.connectionState === 'connected')
      ) {
        this.pcState = PCState.Connected;
      }
      if (this.pcState === PCState.Connected) {
        return;
      }
      await sleep(100);
      now = Date.now();
    }

    // have not reconnected, throw
    throw new ConnectionError('could not establish PC connection');
  }

  getDataChannelForKind(kind: DataPacket_Kind, sub?: boolean): RTCDataChannel | undefined {
    if (!sub) {
      if (kind === DataPacket_Kind.LOSSY) {
        return this.lossyDC;
      }
      if (kind === DataPacket_Kind.RELIABLE) {
        return this.reliableDC;
      }
    } else {
      if (kind === DataPacket_Kind.LOSSY) {
        return this.lossyDCSub;
      }
      if (kind === DataPacket_Kind.RELIABLE) {
        return this.reliableDCSub;
      }
    }
  }

  /** @internal */
  negotiate(): Promise<void> {
    // observe signal state
    return new Promise<void>((resolve, reject) => {
      if (!this.publisher) {
        reject(new NegotiationError('publisher is not defined'));
        return;
      }

      this.needsPublisher = true;

      const handleClosed = () => {
        log.debug('engine disconnected while negotiation was ongoing');
        cleanup();
        resolve();
        return;
      };

      const negotiationTimeout = setTimeout(() => {
        reject('negotiation timed out');
      }, this.peerConnectionTimeout);

      const cleanup = () => {
        clearTimeout(negotiationTimeout);
      };

      this.publisher.once(PCEvents.NegotiationStarted, () => {
        this.publisher?.once(PCEvents.NegotiationComplete, () => {
          cleanup();
          resolve();
        });
      });

      this.publisher.once(PCEvents.RTPVideoPayloadTypes, (rtpTypes: MediaAttributes['rtp']) => {
        const rtpMap = new Map<number, VideoCodec>();
        rtpTypes.forEach((rtp) => {
          const codec = rtp.codec.toLowerCase();
          if (isVideoCodec(codec)) {
            rtpMap.set(rtp.payload, codec);
          }
        });
        // this.emit(EngineEvent.RTPVideoMapUpdate, rtpMap);
      });

      this.publisher.negotiate((e) => {
        cleanup();
        reject(e);
      });
    });
  }

  createDataChannels() {
    if (!this.publisher) {
      return;
    }

    // clear old data channel callbacks if recreate
    if (this.lossyDC) {
      this.lossyDC.onmessage = null;
      this.lossyDC.onerror = null;
    }
    if (this.reliableDC) {
      this.reliableDC.onmessage = null;
      this.reliableDC.onerror = null;
    }

    // create data channels
    this.lossyDC = this.publisher.pc.createDataChannel(lossyDataChannel, {
      // will drop older packets that arrive
      ordered: true,
      maxRetransmits: 0,
    });
    this.reliableDC = this.publisher.pc.createDataChannel(reliableDataChannel, {
      ordered: true,
    });

    // also handle messages over the pub channel, for backwards compatibility
    this.lossyDC.onmessage = (ev: MessageEvent) => {
      this.onDataMessage?.(ev);
    };
    this.reliableDC.onmessage = (ev: MessageEvent) => {
      this.onDataMessage?.(ev);
    };

    // handle datachannel errors
    this.lossyDC.onerror = this.handleDataError;
    this.reliableDC.onerror = this.handleDataError;

    // set up dc buffer threshold, set to 64kB (otherwise 0 by default)
    this.lossyDC.bufferedAmountLowThreshold = 65535;
    this.reliableDC.bufferedAmountLowThreshold = 65535;

    // handle buffer amount low events
    this.lossyDC.onbufferedamountlow = this.handleBufferedAmountLow;
    this.reliableDC.onbufferedamountlow = this.handleBufferedAmountLow;
  }

  /**
   * @internal
   */
  async ensureDataTransportConnected(
    kind: DataPacket_Kind,
    subscriber: boolean = this.needsSubscriber,
  ) {
    const transport = subscriber ? this.subscriber : this.publisher;
    const transportName = subscriber ? 'Subscriber' : 'Publisher';
    if (!transport) {
      throw new ConnectionError(`${transportName} connection not set`);
    }

    if (
      !subscriber &&
      !this.publisher?.isICEConnected &&
      this.publisher?.pc.iceConnectionState !== 'checking'
    ) {
      // start negotiation
      this.negotiate();
    }

    const targetChannel = this.getDataChannelForKind(kind, subscriber);
    if (targetChannel?.readyState === 'open') {
      return;
    }

    // wait until ICE connected
    const endTime = new Date().getTime() + this.peerConnectionTimeout;
    while (new Date().getTime() < endTime) {
      if (
        transport.isICEConnected &&
        this.getDataChannelForKind(kind, subscriber)?.readyState === 'open'
      ) {
        return;
      }
      await sleep(50);
    }

    throw new ConnectionError(
      `could not establish ${transportName} connection, state: ${transport.pc.iceConnectionState}`,
    );
  }

  private handleBufferedAmountLow = (event: Event) => {
    const channel = event.currentTarget as RTCDataChannel;
    const channelKind =
      channel.maxRetransmits === 0 ? DataPacket_Kind.LOSSY : DataPacket_Kind.RELIABLE;

    this.onBufferedAmountLow?.(channelKind);
  };

  addICECandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    if (target === SignalTarget.SUBSCRIBER) {
      this.subscriber?.addIceCandidate(candidate);
    } else {
      this.publisher?.addIceCandidate(candidate);
    }
  }

  removeTrack(sender: RTCRtpSender) {
    if (!this.subscriber) {
      throw new ConnectionError('No subscriber connection set');
    }
    this.subscriber.pc.removeTrack(sender);
  }

  async setAnswer(sd: RTCSessionDescriptionInit) {
    if (!this.publisher) {
      return;
    }
    log.debug('received server answer', {
      RTCSdpType: sd.type,
      signalingState: this.publisher.pc.signalingState.toString(),
    });
    await this.publisher.setRemoteDescription(sd);
  }

  async setOffer(sd: RTCSessionDescriptionInit) {
    if (!this.subscriber) {
      throw new UnexpectedConnectionState('Tried to set offer, but no subscriber present');
    }
    log.debug('received server offer', {
      RTCSdpType: sd.type,
      signalingState: this.subscriber.pc.signalingState.toString(),
    });
    await this.subscriber.setRemoteDescription(sd);

    // answer the offer
    const answer = await this.subscriber.createAndSetAnswer();
    return answer;
  }

  setConfiguration(rtcConfig: RTCConfiguration) {
    this.publisher?.pc.setConfiguration(rtcConfig);
    this.subscriber?.pc.setConfiguration(rtcConfig);
  }

  async cleanupPeerConnections() {
    if (this.publisher && this.publisher.pc.signalingState !== 'closed') {
      this.publisher.pc.getSenders().forEach((sender) => {
        try {
          // TODO: react-native-webrtc doesn't have removeTrack yet.
          if (this.publisher?.pc.removeTrack) {
            this.publisher?.pc.removeTrack(sender);
          }
        } catch (e) {
          log.warn('could not removeTrack', { error: e });
        }
      });
    }
    if (this.publisher) {
      this.publisher.close();
    }
    if (this.subscriber) {
      this.subscriber.close();
    }

    const dcCleanup = (dc: RTCDataChannel | undefined) => {
      if (!dc) return;
      dc.close();
      dc.onbufferedamountlow = null;
      dc.onclose = null;
      dc.onclosing = null;
      dc.onerror = null;
      dc.onmessage = null;
      dc.onopen = null;
    };
    dcCleanup(this.lossyDC);
    dcCleanup(this.lossyDCSub);
    dcCleanup(this.reliableDC);
    dcCleanup(this.reliableDCSub);

    this.lossyDC = undefined;
    this.lossyDCSub = undefined;
    this.reliableDC = undefined;
    this.reliableDCSub = undefined;
  }

  verifyTransport(): boolean {
    const requiredTransports = this.getRequiredTransports();
    if (!requiredTransports) {
      return false;
    }
    if (
      requiredTransports.some((pc) => pc.pc.connectionState === 'closed') ||
      requiredTransports.some((pc) => pc.pc.connectionState === 'failed')
    ) {
      return false;
    }

    return true;
  }

  private getRequiredTransports() {
    const requiredTransports: PCTransport[] = [];
    if (this.needsPublisher) {
      if (!this.publisher) {
        log.warn('publisher required, but missing');
        return false;
      }
      requiredTransports.push(this.publisher);
    }
    if (this.needsSubscriber) {
      if (!this.subscriber) {
        log.warn('subscriber required, but missing');
        return false;
      }
      requiredTransports.push(this.subscriber);
    }
    return requiredTransports;
  }

  private createSubscriber(config: RTCConfiguration) {
    const subscriber = new PCTransport(config);

    subscriber.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      log.trace('adding subscriber ICE candidate for peer', ev.candidate);
      this.onICECandidate?.(ev.candidate, SignalTarget.SUBSCRIBER);
    };

    subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
      this.onRemoteTrack?.(ev);
    };

    subscriber.pc.ondatachannel = this.handleDataChannel;

    return subscriber;
  }

  private createPublisher(config: RTCConfiguration) {
    const googConstraints = { optional: [{ googDscp: true }] };
    const publisher = new PCTransport(config, googConstraints);

    publisher.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      log.trace('adding publisher ICE candidate for peer', ev.candidate);
      this.onICECandidate?.(ev.candidate, SignalTarget.PUBLISHER);
    };

    publisher.onOffer = (offer) => {
      this.onPublisherOffer?.(offer);
    };

    return publisher;
  }

  private async createTransceiverRTCRtpSender(
    track: LocalTrack,
    opts: TrackPublishOptions,
    encodings?: RTCRtpEncodingParameters[],
  ) {
    if (!this.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }

    const streams: MediaStream[] = [];

    if (track.mediaStream) {
      streams.push(track.mediaStream);
    }

    const transceiverInit: RTCRtpTransceiverInit = { direction: 'sendonly', streams };
    if (encodings) {
      transceiverInit.sendEncodings = encodings;
    }
    // addTransceiver for react-native is async. web is synchronous, but await won't effect it.
    const transceiver = await this.publisher.pc.addTransceiver(
      track.mediaStreamTrack,
      transceiverInit,
    );

    if (track.kind === Track.Kind.Video && opts.videoCodec) {
      this.setPreferredCodec(transceiver, track.kind, opts.videoCodec);
      track.codec = opts.videoCodec;
    }
    return transceiver.sender;
  }

  private async createRTCRtpSender(track: MediaStreamTrack) {
    if (!this.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }
    return this.publisher.pc.addTrack(track);
  }

  private setPreferredCodec(
    transceiver: RTCRtpTransceiver,
    kind: Track.Kind,
    videoCodec: VideoCodec,
  ) {
    if (!('getCapabilities' in RTCRtpSender)) {
      return;
    }
    const cap = RTCRtpSender.getCapabilities(kind);
    if (!cap) return;
    log.debug('get capabilities', cap);
    const matched: RTCRtpCodecCapability[] = [];
    const partialMatched: RTCRtpCodecCapability[] = [];
    const unmatched: RTCRtpCodecCapability[] = [];
    cap.codecs.forEach((c) => {
      const codec = c.mimeType.toLowerCase();
      if (codec === 'audio/opus') {
        matched.push(c);
        return;
      }
      const matchesVideoCodec = codec === `video/${videoCodec}`;
      if (!matchesVideoCodec) {
        unmatched.push(c);
        return;
      }
      // for h264 codecs that have sdpFmtpLine available, use only if the
      // profile-level-id is 42e01f for cross-browser compatibility
      if (videoCodec === 'h264') {
        if (c.sdpFmtpLine && c.sdpFmtpLine.includes('profile-level-id=42e01f')) {
          matched.push(c);
        } else {
          partialMatched.push(c);
        }
        return;
      }

      matched.push(c);
    });

    if (supportsSetCodecPreferences(transceiver)) {
      transceiver.setCodecPreferences(matched.concat(partialMatched, unmatched));
    }
  }

  private async createSimulcastTransceiverSender(
    track: LocalVideoTrack,
    simulcastTrack: SimulcastTrackInfo,
    opts: TrackPublishOptions,
    encodings?: RTCRtpEncodingParameters[],
  ) {
    if (!this.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }
    const transceiverInit: RTCRtpTransceiverInit = { direction: 'sendonly' };
    if (encodings) {
      transceiverInit.sendEncodings = encodings;
    }
    // addTransceiver for react-native is async. web is synchronous, but await won't effect it.
    const transceiver = await this.publisher.pc.addTransceiver(
      simulcastTrack.mediaStreamTrack,
      transceiverInit,
    );
    if (!opts.videoCodec) {
      return;
    }
    this.setPreferredCodec(transceiver, track.kind, opts.videoCodec);
    track.setSimulcastTrackSender(opts.videoCodec, transceiver.sender);
    return transceiver.sender;
  }

  private handleDataError = (event: Event) => {
    const channel = event.currentTarget as RTCDataChannel;
    const channelKind = channel.maxRetransmits === 0 ? 'lossy' : 'reliable';

    if (event instanceof ErrorEvent && event.error) {
      const { error } = event.error;
      log.error(`DataChannel error on ${channelKind}: ${event.message}`, error);
    } else {
      log.error(`Unknown DataChannel error on ${channelKind}`, event);
    }
  };
}
