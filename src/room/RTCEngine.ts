import { EventEmitter } from 'events';
import type { MediaAttributes } from 'sdp-transform';
import type TypedEventEmitter from 'typed-emitter';
import type { SignalOptions } from '../api/SignalClient';
import { SignalClient } from '../api/SignalClient';
import log from '../logger';
import type { InternalRoomOptions } from '../options';
import {
  ClientConfigSetting,
  ClientConfiguration,
  DataPacket,
  DataPacket_Kind,
  DisconnectReason,
  ParticipantInfo,
  ReconnectReason,
  Room as RoomModel,
  SpeakerInfo,
  TrackInfo,
  UserPacket,
} from '../proto/livekit_models_pb';
import {
  AddTrackRequest,
  ConnectionQualityUpdate,
  JoinResponse,
  LeaveRequest,
  ReconnectResponse,
  SignalTarget,
  StreamStateUpdate,
  SubscriptionPermissionUpdate,
  SubscriptionResponse,
  TrackPublishedResponse,
} from '../proto/livekit_rtc_pb';
import PCTransport, { PCEvents } from './PCTransport';
import type { ReconnectContext, ReconnectPolicy } from './ReconnectPolicy';
import type { RegionUrlProvider } from './RegionUrlProvider';
import { roomConnectOptionDefaults } from './defaults';
import {
  ConnectionError,
  ConnectionErrorReason,
  NegotiationError,
  TrackInvalidError,
  UnexpectedConnectionState,
} from './errors';
import { EngineEvent } from './events';
import CriticalTimers from './timers';
import type LocalTrack from './track/LocalTrack';
import type LocalVideoTrack from './track/LocalVideoTrack';
import type { SimulcastTrackInfo } from './track/LocalVideoTrack';
import { Track } from './track/Track';
import type { TrackPublishOptions, VideoCodec } from './track/options';
import {
  Mutex,
  isVideoCodec,
  isWeb,
  sleep,
  supportsAddTrack,
  supportsSetCodecPreferences,
  supportsTransceiver,
} from './utils';

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';
const minReconnectWait = 2 * 1000;
const leaveReconnect = 'leave-reconnect';

enum EngineState {
  New,
  Connected,
  Disconnected,
  Reconnecting,
  Closed,
}

/** @internal */
export default class RTCEngine extends (EventEmitter as new () => TypedEventEmitter<EngineEventCallbacks>) {
  publisher?: PCTransport;

  subscriber?: PCTransport;

  client: SignalClient;

  rtcConfig: RTCConfiguration = {};

  peerConnectionTimeout: number = roomConnectOptionDefaults.peerConnectionTimeout;

  fullReconnectOnNext: boolean = false;

  /**
   * @internal
   */
  latestJoinResponse?: JoinResponse;

  get isClosed() {
    return this._isClosed;
  }

  private lossyDC?: RTCDataChannel;

  // @ts-ignore noUnusedLocals
  private lossyDCSub?: RTCDataChannel;

  private reliableDC?: RTCDataChannel;

  private dcBufferStatus: Map<DataPacket_Kind, boolean>;

  // @ts-ignore noUnusedLocals
  private reliableDCSub?: RTCDataChannel;

  private subscriberPrimary: boolean = false;

  private primaryPC?: RTCPeerConnection;

  private engineState: EngineState = EngineState.New;

  private _isClosed: boolean = true;

  private pendingTrackResolvers: {
    [key: string]: { resolve: (info: TrackInfo) => void; reject: () => void };
  } = {};

  // true if publisher connection has already been established.
  // this is helpful to know if we need to restart ICE on the publisher connection
  private needsPublisher: boolean = false;

  // keep join info around for reconnect, this could be a region url
  private url?: string;

  private token?: string;

  private signalOpts?: SignalOptions;

  private reconnectAttempts: number = 0;

  private reconnectStart: number = 0;

  private clientConfiguration?: ClientConfiguration;

  private attemptingReconnect: boolean = false;

  private reconnectPolicy: ReconnectPolicy;

  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  private participantSid?: string;

  /** keeps track of how often an initial join connection has been tried */
  private joinAttempts: number = 0;

  /** specifies how often an initial join connection is allowed to retry */
  private maxJoinAttempts: number = 1;

  private closingLock: Mutex;

  private dataProcessLock: Mutex;

  private shouldFailNext: boolean = false;

  private regionUrlProvider?: RegionUrlProvider;

  constructor(private options: InternalRoomOptions) {
    super();
    this.client = new SignalClient();
    this.client.signalLatency = this.options.expSignalLatency;
    this.reconnectPolicy = this.options.reconnectPolicy;
    this.registerOnLineListener();
    this.closingLock = new Mutex();
    this.dataProcessLock = new Mutex();
    this.dcBufferStatus = new Map([
      [DataPacket_Kind.LOSSY, true],
      [DataPacket_Kind.RELIABLE, true],
    ]);

    this.client.onParticipantUpdate = (updates) =>
      this.emit(EngineEvent.ParticipantUpdate, updates);
    this.client.onConnectionQuality = (update) =>
      this.emit(EngineEvent.ConnectionQualityUpdate, update);
    this.client.onRoomUpdate = (update) => this.emit(EngineEvent.RoomUpdate, update);
    this.client.onSubscriptionError = (resp) => this.emit(EngineEvent.SubscriptionError, resp);
    this.client.onSubscriptionPermissionUpdate = (update) =>
      this.emit(EngineEvent.SubscriptionPermissionUpdate, update);
    this.client.onSpeakersChanged = (update) => this.emit(EngineEvent.SpeakersChanged, update);
    this.client.onStreamStateUpdate = (update) => this.emit(EngineEvent.StreamStateChanged, update);
  }

  async join(
    url: string,
    token: string,
    opts: SignalOptions,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse> {
    this.url = url;
    this.token = token;
    this.signalOpts = opts;
    this.maxJoinAttempts = opts.maxRetries;
    try {
      this.joinAttempts += 1;

      this.setupSignalClientCallbacks();
      const joinResponse = await this.client.join(url, token, opts, abortSignal);
      this._isClosed = false;
      this.latestJoinResponse = joinResponse;

      this.engineState = EngineState.New;
      this.subscriberPrimary = joinResponse.subscriberPrimary;
      if (!this.publisher) {
        console.log('configuring publisher');
        this.configure(joinResponse);
      }

      // create offer
      if (!this.subscriberPrimary || this.needsPublisher) {
        console.log('negotiate');

        this.negotiate();
      }

      this.clientConfiguration = joinResponse.clientConfiguration;
      return joinResponse;
    } catch (e) {
      if (e instanceof ConnectionError) {
        if (e.reason === ConnectionErrorReason.ServerUnreachable) {
          log.warn(
            `Couldn't connect to server, attempt ${this.joinAttempts} of ${this.maxJoinAttempts}`,
          );
          if (this.joinAttempts < this.maxJoinAttempts) {
            return this.join(url, token, opts, abortSignal);
          }
        }
      }
      throw e;
    }
  }

  async close() {
    const unlock = await this.closingLock.lock();
    if (this.isClosed) {
      unlock();
      return;
    }
    try {
      this._isClosed = true;
      this.emit(EngineEvent.Closing);
      this.removeAllListeners();
      this.deregisterOnLineListener();
      this.clearPendingReconnect();
      await this.cleanupPeerConnections();
      await this.cleanupClient();
      this.engineState = EngineState.Closed;
    } finally {
      unlock();
    }
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
      this.publisher = undefined;
    }
    if (this.subscriber) {
      this.subscriber.close();
      this.subscriber = undefined;
    }

    this.primaryPC = undefined;

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

  async cleanupClient() {
    await this.client.close();
    this.client.resetCallbacks();
  }

  addTrack(req: AddTrackRequest): Promise<TrackInfo> {
    if (this.pendingTrackResolvers[req.cid]) {
      throw new TrackInvalidError('a track with the same ID has already been published');
    }
    return new Promise<TrackInfo>((resolve, reject) => {
      const publicationTimeout = setTimeout(() => {
        delete this.pendingTrackResolvers[req.cid];
        reject(
          new ConnectionError('publication of local track timed out, no response from server'),
        );
      }, 10_000);
      this.pendingTrackResolvers[req.cid] = {
        resolve: (info: TrackInfo) => {
          clearTimeout(publicationTimeout);
          resolve(info);
        },
        reject: () => {
          clearTimeout(publicationTimeout);
          reject(new Error('Cancelled publication by calling unpublish'));
        },
      };
      this.client.sendAddTrack(req);
    });
  }

  /**
   * Removes sender from PeerConnection, returning true if it was removed successfully
   * and a negotiation is necessary
   * @param sender
   * @returns
   */
  removeTrack(sender: RTCRtpSender): boolean {
    if (sender.track && this.pendingTrackResolvers[sender.track.id]) {
      const { reject } = this.pendingTrackResolvers[sender.track.id];
      if (reject) {
        reject();
      }
      delete this.pendingTrackResolvers[sender.track.id];
    }
    try {
      this.publisher?.pc.removeTrack(sender);
      return true;
    } catch (e: unknown) {
      log.warn('failed to remove track', { error: e, method: 'removeTrack' });
    }
    return false;
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
  }

  get dataSubscriberReadyState(): string | undefined {
    return this.reliableDCSub?.readyState;
  }

  async getConnectedServerAddress(): Promise<string | undefined> {
    if (this.primaryPC === undefined) {
      return undefined;
    }
    return getConnectedAddress(this.primaryPC);
  }

  /* @internal */
  setRegionUrlProvider(provider: RegionUrlProvider) {
    this.regionUrlProvider = provider;
  }

  private configure(joinResponse: JoinResponse) {
    // already configured
    if (this.publisher || this.subscriber) {
      return;
    }

    this.participantSid = joinResponse.participant?.sid;

    const rtcConfig = this.makeRTCConfiguration(joinResponse);

    if (this.signalOpts?.e2eeEnabled) {
      log.debug('E2EE - setting up transports with insertable streams');
      //  this makes sure that no data is sent before the transforms are ready
      // @ts-ignore
      rtcConfig.encodedInsertableStreams = true;
    }

    const googConstraints = { optional: [{ googDscp: true }] };
    this.publisher = new PCTransport(rtcConfig, googConstraints);
    this.subscriber = new PCTransport(rtcConfig);

    this.emit(EngineEvent.TransportsCreated, this.publisher, this.subscriber);

    this.publisher.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      log.trace('adding ICE candidate for peer', ev.candidate);
      this.client.sendIceCandidate(ev.candidate, SignalTarget.PUBLISHER);
    };

    this.subscriber.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.client.sendIceCandidate(ev.candidate, SignalTarget.SUBSCRIBER);
    };

    this.publisher.onOffer = (offer) => {
      this.client.sendOffer(offer);
    };

    let primaryPC = this.publisher.pc;
    let secondaryPC = this.subscriber.pc;
    let subscriberPrimary = joinResponse.subscriberPrimary;
    if (subscriberPrimary) {
      primaryPC = this.subscriber.pc;
      secondaryPC = this.publisher.pc;
      // in subscriber primary mode, server side opens sub data channels.
      this.subscriber.pc.ondatachannel = this.handleDataChannel;
    }
    this.primaryPC = primaryPC;
    primaryPC.onconnectionstatechange = async () => {
      log.debug(`primary PC state changed ${primaryPC.connectionState}`);
      if (primaryPC.connectionState === 'connected') {
        const initialFullConnection =
          (this.engineState === EngineState.New && !this.needsPublisher) ||
          this.publisher?.pc.connectionState === 'connected';
        if (initialFullConnection) {
          this.engineState = EngineState.Connected;
          this.emit(EngineEvent.Connected, joinResponse);
        }
      } else if (primaryPC.connectionState === 'failed') {
        // on Safari, PeerConnection will switch to 'disconnected' during renegotiation
        if (this.engineState === EngineState.Connected) {
          this.engineState = EngineState.Disconnected;
          console.log('primary failed');
          this.handleDisconnect(
            'primary peerconnection',
            subscriberPrimary
              ? ReconnectReason.RR_SUBSCRIBER_FAILED
              : ReconnectReason.RR_PUBLISHER_FAILED,
          );
        }
      }
    };
    secondaryPC.onconnectionstatechange = async () => {
      if (secondaryPC.connectionState === 'connected') {
        const initialFullConnection =
          this.engineState === EngineState.New && primaryPC.connectionState === 'connected';
        if (initialFullConnection) {
          this.engineState = EngineState.Connected;
          this.emit(EngineEvent.Connected, joinResponse);
        }
      }
      log.warn(`secondary PC state changed ${secondaryPC.connectionState}`);
      // also reconnect if secondary peerconnection fails
      if (secondaryPC.connectionState === 'failed') {
        log.warn('issuing reconnect for secondary PC failed');
        this.handleDisconnect(
          'secondary peerconnection',
          subscriberPrimary
            ? ReconnectReason.RR_PUBLISHER_FAILED
            : ReconnectReason.RR_SUBSCRIBER_FAILED,
        );
      }
    };

    this.subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
      this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.streams[0], ev.receiver);
    };

    this.createDataChannels();
  }

  private setupSignalClientCallbacks() {
    // configure signaling client
    this.client.onAnswer = async (sd) => {
      if (!this.publisher) {
        return;
      }
      log.debug('received server answer', {
        RTCSdpType: sd.type,
        signalingState: this.publisher.pc.signalingState.toString(),
      });
      await this.publisher.setRemoteDescription(sd);
    };

    // add candidate on trickle
    this.client.onTrickle = (candidate, target) => {
      if (!this.publisher || !this.subscriber) {
        return;
      }
      log.trace('got ICE candidate from peer', { candidate, target });
      if (target === SignalTarget.PUBLISHER) {
        this.publisher.addIceCandidate(candidate);
      } else {
        this.subscriber.addIceCandidate(candidate);
      }
    };

    // when server creates an offer for the client
    this.client.onOffer = async (sd) => {
      if (!this.subscriber) {
        return;
      }
      log.debug('received server offer', {
        RTCSdpType: sd.type,
        signalingState: this.subscriber.pc.signalingState.toString(),
      });
      await this.subscriber.setRemoteDescription(sd);

      // answer the offer
      const answer = await this.subscriber.createAndSetAnswer();
      this.client.sendAnswer(answer);
    };

    this.client.onLocalTrackPublished = (res: TrackPublishedResponse) => {
      log.debug('received trackPublishedResponse', res);
      if (!this.pendingTrackResolvers[res.cid]) {
        log.error(`missing track resolver for ${res.cid}`);
        return;
      }
      const { resolve } = this.pendingTrackResolvers[res.cid];
      delete this.pendingTrackResolvers[res.cid];
      resolve(res.track!);
    };

    this.client.onTokenRefresh = (token: string) => {
      this.token = token;
    };

    this.client.onClose = () => {
      console.log('signal closed, disconnect engine');
      this.handleDisconnect('signal', ReconnectReason.RR_SIGNAL_DISCONNECTED);
    };

    this.client.onLeave = (leave?: LeaveRequest) => {
      if (leave?.canReconnect) {
        this.fullReconnectOnNext = true;
        this.primaryPC = undefined;
        // reconnect immediately instead of waiting for next attempt
        this.handleDisconnect(leaveReconnect);
      } else {
        this.emit(EngineEvent.Disconnected, leave?.reason);
        this.close();
      }
      log.trace('leave request', { leave });
    };
  }

  private makeRTCConfiguration(serverResponse: JoinResponse | ReconnectResponse): RTCConfiguration {
    const rtcConfig = { ...this.rtcConfig };

    // update ICE servers before creating PeerConnection
    if (serverResponse.iceServers && !rtcConfig.iceServers) {
      const rtcIceServers: RTCIceServer[] = [];
      serverResponse.iceServers.forEach((iceServer) => {
        const rtcIceServer: RTCIceServer = {
          urls: iceServer.urls,
        };
        if (iceServer.username) rtcIceServer.username = iceServer.username;
        if (iceServer.credential) {
          rtcIceServer.credential = iceServer.credential;
        }
        rtcIceServers.push(rtcIceServer);
      });
      rtcConfig.iceServers = rtcIceServers;
    }

    if (
      serverResponse.clientConfiguration &&
      serverResponse.clientConfiguration.forceRelay === ClientConfigSetting.ENABLED
    ) {
      rtcConfig.iceTransportPolicy = 'relay';
    }

    // @ts-ignore
    rtcConfig.sdpSemantics = 'unified-plan';
    // @ts-ignore
    rtcConfig.continualGatheringPolicy = 'gather_continually';

    return rtcConfig;
  }

  private createDataChannels() {
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
    this.lossyDC.onmessage = this.handleDataMessage;
    this.reliableDC.onmessage = this.handleDataMessage;

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

  private handleDataChannel = async ({ channel }: RTCDataChannelEvent) => {
    if (!channel) {
      return;
    }
    if (channel.label === reliableDataChannel) {
      this.reliableDCSub = channel;
    } else if (channel.label === lossyDataChannel) {
      this.lossyDCSub = channel;
    } else {
      return;
    }
    log.debug(`on data channel ${channel.id}, ${channel.label}`);
    channel.onmessage = this.handleDataMessage;
  };

  private handleDataMessage = async (message: MessageEvent) => {
    // make sure to respect incoming data message order by processing message events one after the other
    const unlock = await this.dataProcessLock.lock();
    try {
      // decode
      let buffer: ArrayBuffer | undefined;
      if (message.data instanceof ArrayBuffer) {
        buffer = message.data;
      } else if (message.data instanceof Blob) {
        buffer = await message.data.arrayBuffer();
      } else {
        log.error('unsupported data type', message.data);
        return;
      }
      const dp = DataPacket.fromBinary(new Uint8Array(buffer));
      if (dp.value?.case === 'speaker') {
        // dispatch speaker updates
        this.emit(EngineEvent.ActiveSpeakersUpdate, dp.value.value.speakers);
      } else if (dp.value?.case === 'user') {
        this.emit(EngineEvent.DataPacketReceived, dp.value.value, dp.kind);
      }
    } finally {
      unlock();
    }
  };

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

  private handleBufferedAmountLow = (event: Event) => {
    const channel = event.currentTarget as RTCDataChannel;
    const channelKind =
      channel.maxRetransmits === 0 ? DataPacket_Kind.LOSSY : DataPacket_Kind.RELIABLE;

    this.updateAndEmitDCBufferStatus(channelKind);
  };

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

  private async createRTCRtpSender(track: MediaStreamTrack) {
    if (!this.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }
    return this.publisher.pc.addTrack(track);
  }

  // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
  // continues to work, we can reconnect to websocket to continue the session
  // after a number of retries, we'll close and give up permanently
  private handleDisconnect = (connection: string, disconnectReason?: ReconnectReason) => {
    if (this._isClosed) {
      return;
    }

    log.warn(`${connection} disconnected`);
    if (this.reconnectAttempts === 0) {
      // only reset start time on the first try
      this.reconnectStart = Date.now();
    }

    const disconnect = (duration: number) => {
      log.warn(
        `could not recover connection after ${this.reconnectAttempts} attempts, ${duration}ms. giving up`,
      );
      this.emit(EngineEvent.Disconnected);
      this.close();
    };

    const duration = Date.now() - this.reconnectStart;
    let delay = this.getNextRetryDelay({
      elapsedMs: duration,
      retryCount: this.reconnectAttempts,
    });

    if (delay === null) {
      disconnect(duration);
      return;
    }
    if (connection === leaveReconnect) {
      delay = 0;
    }

    log.debug(`reconnecting in ${delay}ms`);

    this.clearReconnectTimeout();
    if (this.token && this.regionUrlProvider) {
      // token may have been refreshed, we do not want to recreate the regionUrlProvider
      // since the current engine may have inherited a regional url
      this.regionUrlProvider.updateToken(this.token);
    }
    this.reconnectTimeout = CriticalTimers.setTimeout(
      () => this.attemptReconnect(disconnectReason),
      delay,
    );
  };

  private async attemptReconnect(reason?: ReconnectReason) {
    if (this._isClosed) {
      return;
    }
    // guard for attempting reconnection multiple times while one attempt is still not finished
    if (this.attemptingReconnect) {
      return;
    }
    if (
      this.clientConfiguration?.resumeConnection === ClientConfigSetting.DISABLED ||
      // signaling state could change to closed due to hardware sleep
      // those connections cannot be resumed
      (this.primaryPC?.signalingState ?? 'closed') === 'closed'
    ) {
      this.fullReconnectOnNext = true;
    }

    try {
      this.attemptingReconnect = true;
      if (this.fullReconnectOnNext) {
        await this.restartConnection();
      } else {
        await this.resumeConnection(reason);
      }
      this.clearPendingReconnect();
      this.fullReconnectOnNext = false;
    } catch (e) {
      this.reconnectAttempts += 1;
      let recoverable = true;
      if (e instanceof UnexpectedConnectionState) {
        log.debug('received unrecoverable error', { error: e });
        // unrecoverable
        recoverable = false;
      } else if (!(e instanceof SignalReconnectError)) {
        // cannot resume
        this.fullReconnectOnNext = true;
      }

      if (recoverable) {
        console.log('recoverable, disconnect first', e);
        this.handleDisconnect('reconnect', ReconnectReason.RR_UNKNOWN);
      } else {
        log.info(
          `could not recover connection after ${this.reconnectAttempts} attempts, ${
            Date.now() - this.reconnectStart
          }ms. giving up`,
        );
        this.emit(EngineEvent.Disconnected);
        await this.close();
      }
    } finally {
      this.attemptingReconnect = false;
    }
  }

  private getNextRetryDelay(context: ReconnectContext) {
    try {
      return this.reconnectPolicy.nextRetryDelayInMs(context);
    } catch (e) {
      log.warn('encountered error in reconnect policy', { error: e });
    }

    // error in user code with provided reconnect policy, stop reconnecting
    return null;
  }

  private async restartConnection(regionUrl?: string) {
    try {
      if (!this.url || !this.token) {
        // permanent failure, don't attempt reconnection
        throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
      }

      log.info(`reconnecting, attempt: ${this.reconnectAttempts}`);
      this.emit(EngineEvent.Restarting);

      if (this.client.isConnected) {
        await this.client.sendLeave();
      }
      await this.cleanupPeerConnections();
      this.engineState = EngineState.Closed;
      await this.cleanupClient();

      let joinResponse: JoinResponse;
      try {
        if (!this.signalOpts) {
          log.warn('attempted connection restart, without signal options present');
          throw new SignalReconnectError();
        }
        // in case a regionUrl is passed, the region URL takes precedence
        joinResponse = await this.join(regionUrl ?? this.url, this.token, this.signalOpts);
      } catch (e) {
        if (e instanceof ConnectionError && e.reason === ConnectionErrorReason.NotAllowed) {
          throw new UnexpectedConnectionState('could not reconnect, token might be expired');
        }
        throw new SignalReconnectError();
      }

      if (this.shouldFailNext) {
        console.warn('should fail');
        this.shouldFailNext = false;
        throw new Error('simulated failure');
      }

      this.client.setReconnected();
      this.emit(EngineEvent.SignalRestarted, joinResponse);

      await this.waitForPCInitialConnection();
      this.regionUrlProvider?.resetAttempts();
      // reconnect success
      this.emit(EngineEvent.Restarted);
    } catch (error) {
      const nextRegionUrl = await this.regionUrlProvider?.getNextBestRegionUrl();
      if (nextRegionUrl) {
        await this.restartConnection(nextRegionUrl);
        return;
      } else {
        // no more regions to try (or we're not on cloud)
        this.regionUrlProvider?.resetAttempts();
        throw error;
      }
    }
  }

  private async resumeConnection(reason?: ReconnectReason): Promise<void> {
    if (!this.url || !this.token) {
      // permanent failure, don't attempt reconnection
      throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
    }
    // trigger publisher reconnect
    if (!this.publisher || !this.subscriber) {
      throw new UnexpectedConnectionState('publisher and subscriber connections unset');
    }

    log.info(`resuming signal connection, attempt ${this.reconnectAttempts}`);
    this.emit(EngineEvent.Resuming);

    try {
      this.setupSignalClientCallbacks();
      const res = await this.client.reconnect(this.url, this.token, this.participantSid, reason);
      if (res) {
        const rtcConfig = this.makeRTCConfiguration(res);
        this.publisher.pc.setConfiguration(rtcConfig);
        this.subscriber.pc.setConfiguration(rtcConfig);
      }
    } catch (e) {
      let message = '';
      if (e instanceof Error) {
        message = e.message;
      }
      if (e instanceof ConnectionError && e.reason === ConnectionErrorReason.NotAllowed) {
        throw new UnexpectedConnectionState('could not reconnect, token might be expired');
      }
      throw new SignalReconnectError(message);
    }
    this.emit(EngineEvent.SignalResumed);
    console.log('signal resumed');

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error('simulated failure');
    }

    this.subscriber.restartingIce = true;

    // only restart publisher if it's needed
    if (this.needsPublisher) {
      console.warn('needs publisher');
      await this.publisher.createAndSendOffer({ iceRestart: true });
    } else {
      console.warn('does not need publisher');
    }

    console.log('waiting for pc reconnect', this.needsPublisher);
    await this.waitForPCReconnected();
    this.client.setReconnected();

    // recreate publish datachannel if it's id is null
    // (for safari https://bugs.webkit.org/show_bug.cgi?id=184688)
    if (this.reliableDC?.readyState === 'open' && this.reliableDC.id === null) {
      this.createDataChannels();
    }

    // resume success
    this.emit(EngineEvent.Resumed);
  }

  async waitForPCInitialConnection(timeout?: number, abortController?: AbortController) {
    if (this.engineState === EngineState.Connected) {
      console.log('already connected!!!!!');
      return;
    }
    if (this.engineState !== EngineState.New) {
      throw new UnexpectedConnectionState(
        'Expected peer connection to be new on initial connection',
      );
    }
    return new Promise<void>((resolve, reject) => {
      const abortHandler = () => {
        log.warn('closing engine');
        CriticalTimers.clearTimeout(connectTimeout);

        reject(
          new ConnectionError(
            'room connection has been cancelled',
            ConnectionErrorReason.Cancelled,
          ),
        );
      };
      if (abortController?.signal.aborted) {
        abortHandler();
      }
      abortController?.signal.addEventListener('abort', abortHandler);
      const onConnected = () => {
        CriticalTimers.clearTimeout(connectTimeout);
        abortController?.signal.removeEventListener('abort', abortHandler);
        resolve();
      };
      const connectTimeout = CriticalTimers.setTimeout(() => {
        this.off(EngineEvent.Connected, onConnected);
        reject(new ConnectionError('could not establish pc connection'));
      }, timeout ?? this.peerConnectionTimeout);
      this.once(EngineEvent.Connected, onConnected);
    });
  }

  private async waitForPCReconnected() {
    const startTime = Date.now();
    let now = startTime;
    this.engineState = EngineState.Reconnecting;

    log.debug('waiting for peer connection to reconnect');
    while (now - startTime < this.peerConnectionTimeout) {
      console.log(this.publisher?.pc);
      if (this.primaryPC === undefined) {
        console.warn('primary missing, connection hosed');
        // we can abort early, connection is hosed
        break;
      } else if (
        // on Safari, we don't get a connectionstatechanged event during ICE restart
        // this means we'd have to check its status manually and update address
        // manually
        now - startTime > minReconnectWait &&
        this.primaryPC?.connectionState === 'connected' &&
        (!this.needsPublisher || this.publisher?.pc.connectionState === 'connected')
      ) {
        this.engineState = EngineState.Connected;
        return;
      }
      await sleep(100);
      now = Date.now();
    }

    // have not reconnected, throw
    throw new ConnectionError('could not establish PC connection');
  }

  waitForRestarted = () => {
    return new Promise<void>((resolve, reject) => {
      if (this.engineState === EngineState.Connected) {
        resolve();
      }
      const onRestarted = () => {
        this.off(EngineEvent.Disconnected, onDisconnected);
        resolve();
      };
      const onDisconnected = () => {
        this.off(EngineEvent.Restarted, onRestarted);
        reject();
      };
      this.once(EngineEvent.Restarted, onRestarted);
      this.once(EngineEvent.Disconnected, onDisconnected);
    });
  };

  /* @internal */
  async sendDataPacket(packet: DataPacket, kind: DataPacket_Kind) {
    const msg = packet.toBinary();

    // make sure we do have a data connection
    await this.ensurePublisherConnected(kind);

    const dc = this.dataChannelForKind(kind);
    if (dc) {
      dc.send(msg);
    }

    this.updateAndEmitDCBufferStatus(kind);
  }

  private updateAndEmitDCBufferStatus = (kind: DataPacket_Kind) => {
    const status = this.isBufferStatusLow(kind);
    if (typeof status !== 'undefined' && status !== this.dcBufferStatus.get(kind)) {
      this.dcBufferStatus.set(kind, status);
      this.emit(EngineEvent.DCBufferStatusChanged, status, kind);
    }
  };

  private isBufferStatusLow = (kind: DataPacket_Kind): boolean | undefined => {
    const dc = this.dataChannelForKind(kind);
    if (dc) {
      return dc.bufferedAmount <= dc.bufferedAmountLowThreshold;
    }
  };

  /**
   * @internal
   */
  async ensureDataTransportConnected(
    kind: DataPacket_Kind,
    subscriber: boolean = this.subscriberPrimary,
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

    const targetChannel = this.dataChannelForKind(kind, subscriber);
    if (targetChannel?.readyState === 'open') {
      return;
    }

    // wait until ICE connected
    const endTime = new Date().getTime() + this.peerConnectionTimeout;
    while (new Date().getTime() < endTime) {
      if (
        transport.isICEConnected &&
        this.dataChannelForKind(kind, subscriber)?.readyState === 'open'
      ) {
        return;
      }
      await sleep(50);
    }

    throw new ConnectionError(
      `could not establish ${transportName} connection, state: ${transport.pc.iceConnectionState}`,
    );
  }

  private async ensurePublisherConnected(kind: DataPacket_Kind) {
    await this.ensureDataTransportConnected(kind, false);
  }

  /* @internal */
  verifyTransport(): boolean {
    console.log(
      'verifying transport',
      this.needsPublisher,
      this.primaryPC?.connectionState,
      this.publisher?.pc.connectionState,
    );
    // primary connection
    if (!this.primaryPC) {
      log.warn('no primary PC');
      return false;
    }
    if (
      this.primaryPC.connectionState === 'closed' ||
      this.primaryPC.connectionState === 'failed'
    ) {
      log.warn('primary pc connectionState issue', {
        state: this.primaryPC.connectionState,
        subPrimary: this.subscriberPrimary,
      });
      return false;
    }

    // also verify publisher connection if it's needed or different
    if (this.needsPublisher && this.subscriberPrimary) {
      if (!this.publisher) {
        log.warn('publisher not present');
        return false;
      }
      if (
        this.publisher.pc.connectionState === 'closed' ||
        this.publisher.pc.connectionState === 'failed'
      ) {
        log.warn('publisher connection state issue', { state: this.publisher.pc.connectionState });
        return false;
      }
    }

    // ensure signal is connected
    if (!this.client.ws || this.client.ws.readyState === WebSocket.CLOSED) {
      log.warn('signal not connected');
      return false;
    }
    return true;
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

      if (this.isClosed) {
        reject('cannot negotiate on closed engine');
      }
      this.on(EngineEvent.Closing, handleClosed);

      const negotiationTimeout = setTimeout(() => {
        reject('negotiation timed out');
        console.log('negotiation timeout');
        this.handleDisconnect('negotiation', ReconnectReason.RR_SIGNAL_DISCONNECTED);
      }, this.peerConnectionTimeout);

      const cleanup = () => {
        clearTimeout(negotiationTimeout);
        this.off(EngineEvent.Closing, handleClosed);
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
        this.emit(EngineEvent.RTPVideoMapUpdate, rtpMap);
      });

      this.publisher.negotiate((e) => {
        cleanup();
        reject(e);
        if (e instanceof NegotiationError) {
          this.fullReconnectOnNext = true;
        }
        console.log('publisher negotiation error');
        this.handleDisconnect('negotiation', ReconnectReason.RR_UNKNOWN);
      });
    });
  }

  dataChannelForKind(kind: DataPacket_Kind, sub?: boolean): RTCDataChannel | undefined {
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

  /* @internal */
  failNext() {
    // debugging method to fail the next reconnect/resume attempt
    this.shouldFailNext = true;
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      CriticalTimers.clearTimeout(this.reconnectTimeout);
    }
  }

  private clearPendingReconnect() {
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;
  }

  private handleBrowserOnLine = () => {
    // in case the engine is currently reconnecting, attempt a reconnect immediately after the browser state has changed to 'onLine'
    if (this.client.isReconnecting) {
      this.clearReconnectTimeout();
      this.attemptReconnect(ReconnectReason.RR_SIGNAL_DISCONNECTED);
    }
  };

  private registerOnLineListener() {
    if (isWeb()) {
      window.addEventListener('online', this.handleBrowserOnLine);
    }
  }

  private deregisterOnLineListener() {
    if (isWeb()) {
      window.removeEventListener('online', this.handleBrowserOnLine);
    }
  }
}

async function getConnectedAddress(pc: RTCPeerConnection): Promise<string | undefined> {
  let selectedCandidatePairId = '';
  const candidatePairs = new Map<string, RTCIceCandidatePairStats>();
  // id -> candidate ip
  const candidates = new Map<string, string>();
  const stats: RTCStatsReport = await pc.getStats();
  stats.forEach((v) => {
    switch (v.type) {
      case 'transport':
        selectedCandidatePairId = v.selectedCandidatePairId;
        break;
      case 'candidate-pair':
        if (selectedCandidatePairId === '' && v.selected) {
          selectedCandidatePairId = v.id;
        }
        candidatePairs.set(v.id, v);
        break;
      case 'remote-candidate':
        candidates.set(v.id, `${v.address}:${v.port}`);
        break;
      default:
    }
  });

  if (selectedCandidatePairId === '') {
    return undefined;
  }
  const selectedID = candidatePairs.get(selectedCandidatePairId)?.remoteCandidateId;
  if (selectedID === undefined) {
    return undefined;
  }
  return candidates.get(selectedID);
}

class SignalReconnectError extends Error {}

export type EngineEventCallbacks = {
  connected: (joinResp: JoinResponse) => void;
  disconnected: (reason?: DisconnectReason) => void;
  resuming: () => void;
  resumed: () => void;
  restarting: () => void;
  restarted: () => void;
  signalResumed: () => void;
  signalRestarted: (joinResp: JoinResponse) => void;
  closing: () => void;
  mediaTrackAdded: (
    track: MediaStreamTrack,
    streams: MediaStream,
    receiver?: RTCRtpReceiver,
  ) => void;
  activeSpeakersUpdate: (speakers: Array<SpeakerInfo>) => void;
  dataPacketReceived: (userPacket: UserPacket, kind: DataPacket_Kind) => void;
  transportsCreated: (publisher: PCTransport, subscriber: PCTransport) => void;
  /** @internal */
  trackSenderAdded: (track: Track, sender: RTCRtpSender) => void;
  rtpVideoMapUpdate: (rtpMap: Map<number, VideoCodec>) => void;
  dcBufferStatusChanged: (isLow: boolean, kind: DataPacket_Kind) => void;
  participantUpdate: (infos: ParticipantInfo[]) => void;
  roomUpdate: (room: RoomModel) => void;
  connectionQualityUpdate: (update: ConnectionQualityUpdate) => void;
  speakersChanged: (speakerUpdates: SpeakerInfo[]) => void;
  streamStateChanged: (update: StreamStateUpdate) => void;
  subscriptionError: (resp: SubscriptionResponse) => void;
  subscriptionPermissionUpdate: (update: SubscriptionPermissionUpdate) => void;
};
