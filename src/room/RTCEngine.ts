import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import { SignalClient, SignalOptions } from '../api/SignalClient';
import log from '../logger';
import {
  ClientConfigSetting,
  ClientConfiguration,
  DataPacket,
  DataPacket_Kind,
  SpeakerInfo,
  TrackInfo,
  UserPacket,
} from '../proto/livekit_models';
import {
  AddTrackRequest,
  JoinResponse,
  LeaveRequest,
  SignalTarget,
  TrackPublishedResponse,
} from '../proto/livekit_rtc';
import { ConnectionError, TrackInvalidError, UnexpectedConnectionState } from './errors';
import { EngineEvent } from './events';
import PCTransport from './PCTransport';
import { isFireFox, isWeb, sleep } from './utils';

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';
const maxReconnectRetries = 10;
const minReconnectWait = 2 * 1000;
const maxReconnectDuration = 60 * 1000;
export const maxICEConnectTimeout = 15 * 1000;

enum PCState {
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

  get isClosed() {
    return this._isClosed;
  }

  private lossyDC?: RTCDataChannel;

  // @ts-ignore noUnusedLocals
  private lossyDCSub?: RTCDataChannel;

  private reliableDC?: RTCDataChannel;

  // @ts-ignore noUnusedLocals
  private reliableDCSub?: RTCDataChannel;

  private subscriberPrimary: boolean = false;

  private primaryPC?: RTCPeerConnection;

  private pcState: PCState = PCState.New;

  private _isClosed: boolean = true;

  private pendingTrackResolvers: { [key: string]: (info: TrackInfo) => void } = {};

  // true if publisher connection has already been established.
  // this is helpful to know if we need to restart ICE on the publisher connection
  private hasPublished: boolean = false;

  // keep join info around for reconnect
  private url?: string;

  private token?: string;

  private signalOpts?: SignalOptions;

  private reconnectAttempts: number = 0;

  private reconnectStart: number = 0;

  private fullReconnectOnNext: boolean = false;

  private clientConfiguration?: ClientConfiguration;

  private connectedServerAddr?: string;

  private attemptingReconnect: boolean = false;

  constructor() {
    super();
    this.client = new SignalClient();
  }

  async join(
    url: string,
    token: string,
    opts?: SignalOptions,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse> {
    this.url = url;
    this.token = token;
    this.signalOpts = opts;

    const joinResponse = await this.client.join(url, token, opts, abortSignal);
    this._isClosed = false;

    this.subscriberPrimary = joinResponse.subscriberPrimary;
    if (!this.publisher) {
      this.configure(joinResponse);
    }

    // create offer
    if (!this.subscriberPrimary) {
      this.negotiate();
    }
    this.clientConfiguration = joinResponse.clientConfiguration;

    return joinResponse;
  }

  close() {
    this._isClosed = true;

    this.removeAllListeners();
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
      this.publisher.close();
      this.publisher = undefined;
    }
    if (this.subscriber) {
      this.subscriber.close();
      this.subscriber = undefined;
    }
    this.client.close();
  }

  addTrack(req: AddTrackRequest): Promise<TrackInfo> {
    if (this.pendingTrackResolvers[req.cid]) {
      throw new TrackInvalidError('a track with the same ID has already been published');
    }
    return new Promise<TrackInfo>((resolve) => {
      this.pendingTrackResolvers[req.cid] = resolve;
      this.client.sendAddTrack(req);
    });
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
  }

  get dataSubscriberReadyState(): string | undefined {
    return this.reliableDCSub?.readyState;
  }

  get connectedServerAddress(): string | undefined {
    return this.connectedServerAddr;
  }

  private configure(joinResponse: JoinResponse) {
    // already configured
    if (this.publisher || this.subscriber) {
      return;
    }

    // update ICE servers before creating PeerConnection
    if (joinResponse.iceServers && !this.rtcConfig.iceServers) {
      const rtcIceServers: RTCIceServer[] = [];
      joinResponse.iceServers.forEach((iceServer) => {
        const rtcIceServer: RTCIceServer = {
          urls: iceServer.urls,
        };
        if (iceServer.username) rtcIceServer.username = iceServer.username;
        if (iceServer.credential) {
          rtcIceServer.credential = iceServer.credential;
        }
        rtcIceServers.push(rtcIceServer);
      });
      this.rtcConfig.iceServers = rtcIceServers;
    }

    // @ts-ignore
    this.rtcConfig.sdpSemantics = 'unified-plan';
    // @ts-ignore
    this.rtcConfig.continualGatheringPolicy = 'gather_continually';

    this.publisher = new PCTransport(this.rtcConfig);
    this.subscriber = new PCTransport(this.rtcConfig);

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
    if (joinResponse.subscriberPrimary) {
      primaryPC = this.subscriber.pc;
      secondaryPC = this.publisher.pc;
      // in subscriber primary mode, server side opens sub data channels.
      this.subscriber.pc.ondatachannel = this.handleDataChannel;
    }
    this.primaryPC = primaryPC;
    primaryPC.onconnectionstatechange = async () => {
      log.debug('primary PC state changed', {
        state: primaryPC.connectionState,
      });
      if (primaryPC.connectionState === 'connected') {
        try {
          this.connectedServerAddr = await getConnectedAddress(primaryPC);
        } catch (e) {
          log.warn('could not get connected server address', { error: e });
        }
        const shouldEmit = this.pcState === PCState.New;
        this.pcState = PCState.Connected;
        if (shouldEmit) {
          this.emit(EngineEvent.Connected);
        }
      } else if (primaryPC.connectionState === 'failed') {
        // on Safari, PeerConnection will switch to 'disconnected' during renegotiation
        if (this.pcState === PCState.Connected) {
          this.pcState = PCState.Disconnected;

          this.handleDisconnect('primary peerconnection');
        }
      }
    };
    secondaryPC.onconnectionstatechange = async () => {
      log.debug('secondary PC state changed', {
        state: secondaryPC.connectionState,
      });
      // also reconnect if secondary peerconnection fails
      if (secondaryPC.connectionState === 'failed') {
        this.handleDisconnect('secondary peerconnection');
      }
    };

    if (isWeb()) {
      this.subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
        this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.streams[0], ev.receiver);
      };
    } else {
      // TODO: react-native-webrtc doesn't have ontrack yet, replace when ready.
      // @ts-ignore
      this.subscriber.pc.onaddstream = (ev: { stream: MediaStream }) => {
        const track = ev.stream.getTracks()[0];
        this.emit(EngineEvent.MediaTrackAdded, track, ev.stream);
      };
    }
    // data channels
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

    // configure signaling client
    this.client.onAnswer = async (sd) => {
      if (!this.publisher) {
        return;
      }
      log.debug('received server answer', {
        RTCSdpType: sd.type,
        signalingState: this.publisher.pc.signalingState,
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
        signalingState: this.subscriber.pc.signalingState,
      });
      await this.subscriber.setRemoteDescription(sd);

      // answer the offer
      const answer = await this.subscriber.pc.createAnswer();
      await this.subscriber.pc.setLocalDescription(answer);
      this.client.sendAnswer(answer);
    };

    this.client.onLocalTrackPublished = (res: TrackPublishedResponse) => {
      log.debug('received trackPublishedResponse', res);
      const resolve = this.pendingTrackResolvers[res.cid];
      if (!resolve) {
        log.error(`missing track resolver for ${res.cid}`);
        return;
      }
      delete this.pendingTrackResolvers[res.cid];
      resolve(res.track!);
    };

    this.client.onTokenRefresh = (token: string) => {
      this.token = token;
    };

    this.client.onClose = () => {
      this.handleDisconnect('signal');
    };

    this.client.onLeave = (leave?: LeaveRequest) => {
      if (leave?.canReconnect) {
        this.fullReconnectOnNext = true;
        this.primaryPC = undefined;
      } else {
        this.emit(EngineEvent.Disconnected);
        this.close();
      }
    };
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
    const dp = DataPacket.decode(new Uint8Array(buffer));
    if (dp.speaker) {
      // dispatch speaker updates
      this.emit(EngineEvent.ActiveSpeakersUpdate, dp.speaker.speakers);
    } else if (dp.user) {
      this.emit(EngineEvent.DataPacketReceived, dp.user, dp.kind);
    }
  };

  private handleDataError = (event: Event) => {
    const channel = event.currentTarget as RTCDataChannel;
    const channelKind = channel.maxRetransmits === 0 ? 'lossy' : 'reliable';

    if (event instanceof ErrorEvent) {
      const { error } = event.error;
      log.error(`DataChannel error on ${channelKind}: ${event.message}`, error);
    } else {
      log.error(`Unknown DataChannel Error on ${channelKind}`, event);
    }
  };

  // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
  // continues to work, we can reconnect to websocket to continue the session
  // after a number of retries, we'll close and give up permanently
  private handleDisconnect = (connection: string) => {
    if (this._isClosed) {
      return;
    }
    log.debug(`${connection} disconnected`);
    if (this.reconnectAttempts === 0) {
      // only reset start time on the first try
      this.reconnectStart = Date.now();
    }

    const delay = this.reconnectAttempts * this.reconnectAttempts * 300;
    setTimeout(async () => {
      if (this._isClosed) {
        return;
      }
      // guard for attempting reconnection multiple times while one attempt is still not finished
      if (this.attemptingReconnect) {
        return;
      }
      if (
        isFireFox() || // TODO remove once clientConfiguration handles firefox case server side
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
          await this.resumeConnection();
        }
        this.reconnectAttempts = 0;
        this.fullReconnectOnNext = false;
      } catch (e) {
        this.reconnectAttempts += 1;
        let reconnectRequired = false;
        let recoverable = true;
        if (e instanceof UnexpectedConnectionState) {
          log.debug('received unrecoverable error', { error: e });
          // unrecoverable
          recoverable = false;
        } else if (!(e instanceof SignalReconnectError)) {
          // cannot resume
          reconnectRequired = true;
        }

        // when we flip from resume to reconnect, we need to reset reconnectAttempts
        // this is needed to fire the right reconnecting events
        if (reconnectRequired && !this.fullReconnectOnNext) {
          this.fullReconnectOnNext = true;
          this.reconnectAttempts = 0;
        }

        const duration = Date.now() - this.reconnectStart;
        if (this.reconnectAttempts >= maxReconnectRetries || duration > maxReconnectDuration) {
          recoverable = false;
        }

        if (recoverable) {
          this.handleDisconnect('reconnect');
        } else {
          log.info(
            `could not recover connection after ${maxReconnectRetries} attempts, ${duration}ms. giving up`,
          );
          this.emit(EngineEvent.Disconnected);
          this.close();
        }
      } finally {
        this.attemptingReconnect = false;
      }
    }, delay);
  };

  private async restartConnection() {
    if (!this.url || !this.token) {
      // permanent failure, don't attempt reconnection
      throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
    }

    log.info(`reconnecting, attempt: ${this.reconnectAttempts}`);
    if (this.reconnectAttempts === 0) {
      this.emit(EngineEvent.Restarting);
    }

    if (this.client.isConnected) {
      this.client.sendLeave();
    }
    this.client.close();
    this.primaryPC = undefined;
    this.publisher?.close();
    this.publisher = undefined;
    this.subscriber?.close();
    this.subscriber = undefined;

    let joinResponse: JoinResponse;
    try {
      joinResponse = await this.join(this.url, this.token, this.signalOpts);
    } catch (e) {
      throw new SignalReconnectError();
    }

    await this.waitForPCConnected();
    this.client.setReconnected();

    // reconnect success
    this.emit(EngineEvent.Restarted, joinResponse);
  }

  private async resumeConnection(): Promise<void> {
    if (!this.url || !this.token) {
      // permanent failure, don't attempt reconnection
      throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
    }
    // trigger publisher reconnect
    if (!this.publisher || !this.subscriber) {
      throw new UnexpectedConnectionState('publisher and subscriber connections unset');
    }

    log.info(`resuming signal connection, attempt ${this.reconnectAttempts}`);
    if (this.reconnectAttempts === 0) {
      this.emit(EngineEvent.Resuming);
    }

    try {
      await this.client.reconnect(this.url, this.token);
    } catch (e) {
      throw new SignalReconnectError();
    }
    this.emit(EngineEvent.SignalResumed);

    this.subscriber.restartingIce = true;

    // only restart publisher if it's needed
    if (this.hasPublished) {
      await this.publisher.createAndSendOffer({ iceRestart: true });
    }

    await this.waitForPCConnected();
    this.client.setReconnected();

    // resume success
    this.emit(EngineEvent.Resumed);
  }

  async waitForPCConnected() {
    const startTime = Date.now();
    let now = startTime;
    this.pcState = PCState.Reconnecting;

    log.debug('waiting for peer connection to reconnect');
    while (now - startTime < maxICEConnectTimeout) {
      if (this.primaryPC === undefined) {
        // we can abort early, connection is hosed
        break;
      } else if (
        // on Safari, we don't get a connectionstatechanged event during ICE restart
        // this means we'd have to check its status manually and update address
        // manually
        now - startTime > minReconnectWait &&
        this.primaryPC?.connectionState === 'connected'
      ) {
        this.pcState = PCState.Connected;
        try {
          this.connectedServerAddr = await getConnectedAddress(this.primaryPC);
        } catch (e) {
          log.warn('could not get connected server address', { error: e });
        }
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

  /* @internal */
  async sendDataPacket(packet: DataPacket, kind: DataPacket_Kind) {
    const msg = DataPacket.encode(packet).finish();

    // make sure we do have a data connection
    await this.ensurePublisherConnected(kind);

    if (kind === DataPacket_Kind.LOSSY && this.lossyDC) {
      this.lossyDC.send(msg);
    } else if (kind === DataPacket_Kind.RELIABLE && this.reliableDC) {
      this.reliableDC.send(msg);
    }
  }

  private async ensurePublisherConnected(kind: DataPacket_Kind) {
    if (!this.subscriberPrimary) {
      return;
    }

    if (!this.publisher) {
      throw new ConnectionError('publisher connection not set');
    }

    if (!this.publisher.isICEConnected && this.publisher.pc.iceConnectionState !== 'checking') {
      // start negotiation
      this.negotiate();
    }

    const targetChannel = this.dataChannelForKind(kind);
    if (targetChannel?.readyState === 'open') {
      return;
    }

    // wait until publisher ICE connected
    const endTime = new Date().getTime() + maxICEConnectTimeout;
    while (new Date().getTime() < endTime) {
      if (this.publisher.isICEConnected && this.dataChannelForKind(kind)?.readyState === 'open') {
        return;
      }
      await sleep(50);
    }

    throw new ConnectionError(
      `could not establish publisher connection, state ${this.publisher?.pc.iceConnectionState}`,
    );
  }

  /** @internal */
  negotiate() {
    if (!this.publisher) {
      return;
    }

    this.hasPublished = true;

    this.publisher.negotiate();
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
  connected: () => void;
  disconnected: () => void;
  resuming: () => void;
  resumed: () => void;
  restarting: () => void;
  restarted: (joinResp: JoinResponse) => void;
  signalResumed: () => void;
  mediaTrackAdded: (
    track: MediaStreamTrack,
    streams: MediaStream,
    receiver?: RTCRtpReceiver,
  ) => void;
  activeSpeakersUpdate: (speakers: Array<SpeakerInfo>) => void;
  dataPacketReceived: (userPacket: UserPacket, kind: DataPacket_Kind) => void;
  transportsCreated: (publisher: PCTransport, subscriber: PCTransport) => void;
};
