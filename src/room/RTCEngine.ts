import { EventEmitter } from 'events';
import log from 'loglevel';
import { SignalClient, SignalOptions } from '../api/SignalClient';
import { DataPacket, DataPacket_Kind, TrackInfo } from '../proto/livekit_models';
import {
  AddTrackRequest,
  JoinResponse,
  SignalTarget,
  TrackPublishedResponse,
} from '../proto/livekit_rtc';
import { ConnectionError, TrackInvalidError, UnexpectedConnectionState } from './errors';
import { EngineEvent } from './events';
import PCTransport from './PCTransport';
import { sleep } from './utils';

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';
const maxReconnectRetries = 5;
export const maxICEConnectTimeout = 5 * 1000;

/** @internal */
export default class RTCEngine extends EventEmitter {
  publisher?: PCTransport;

  subscriber?: PCTransport;

  client: SignalClient;

  private rtcConfig: RTCConfiguration;

  private lossyDC?: RTCDataChannel;

  // @ts-ignore noUnusedLocals
  private lossyDCSub?: RTCDataChannel;

  private reliableDC?: RTCDataChannel;

  // @ts-ignore noUnusedLocals
  private reliableDCSub?: RTCDataChannel;

  private subscriberPrimary: boolean = false;

  private iceConnected: boolean = false;

  private isClosed: boolean = true;

  private pendingTrackResolvers: { [key: string]: (info: TrackInfo) => void } = {};

  // true if publisher connection has already been established.
  // this is helpful to know if we need to restart ICE on the publisher connection
  private hasPublished: boolean = false;

  // keep join info around for reconnect
  private url?: string;

  private token?: string;

  private reconnectAttempts: number = 0;

  constructor(client: SignalClient, config?: RTCConfiguration) {
    super();
    this.client = client;
    this.rtcConfig = config || {};
  }

  async join(url: string, token: string, opts?: SignalOptions): Promise<JoinResponse> {
    this.url = url;
    this.token = token;

    const joinResponse = await this.client.join(url, token, opts);
    this.isClosed = false;

    this.subscriberPrimary = joinResponse.subscriberPrimary;
    if (!this.publisher) {
      this.configure(joinResponse);
    }

    // create offer
    if (!this.subscriberPrimary) {
      await this.negotiate();
    }

    return joinResponse;
  }

  close() {
    this.isClosed = true;

    if (this.publisher) {
      this.publisher.pc.getSenders().forEach((sender) => {
        try {
          this.publisher?.pc.removeTrack(sender);
        } catch (e) {
          log.warn('could not removeTrack', e);
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
      throw new TrackInvalidError(
        'a track with the same ID has already been published',
      );
    }
    return new Promise<TrackInfo>((resolve) => {
      this.pendingTrackResolvers[req.cid] = resolve;
      this.client.sendAddTrack(req);
    });
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
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
        if (iceServer.credential) { rtcIceServer.credential = iceServer.credential; }
        rtcIceServers.push(rtcIceServer);
      });
      this.rtcConfig.iceServers = rtcIceServers;
    }

    this.publisher = new PCTransport(this.rtcConfig);
    this.subscriber = new PCTransport(this.rtcConfig);

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
    if (joinResponse.subscriberPrimary) {
      primaryPC = this.subscriber.pc;
      // in subscriber primary mode, server side opens sub data channels.
      this.subscriber.pc.ondatachannel = this.handleDataChannel;
    }
    primaryPC.oniceconnectionstatechange = () => {
      if (primaryPC.iceConnectionState === 'connected') {
        log.trace('ICE connected');
        if (!this.iceConnected) {
          this.iceConnected = true;
          this.emit(EngineEvent.Connected);
        }
      } else if (primaryPC.iceConnectionState === 'failed') {
        log.trace('ICE disconnected');
        if (this.iceConnected) {
          this.iceConnected = false;

          this.handleDisconnect('peerconnection');
        }
      }
    };

    this.subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
      this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.streams[0], ev.receiver);
    };

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

    // configure signaling client
    this.client.onAnswer = async (sd) => {
      if (!this.publisher) {
        return;
      }
      log.debug(
        'received server answer',
        sd.type,
        this.publisher.pc.signalingState,
      );
      await this.publisher.setRemoteDescription(sd);
    };

    // add candidate on trickle
    this.client.onTrickle = (candidate, target) => {
      if (!this.publisher || !this.subscriber) {
        return;
      }
      log.trace('got ICE candidate from peer', candidate, target);
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
      log.debug(
        'received server offer',
        sd.type,
        this.subscriber.pc.signalingState,
      );
      await this.subscriber.setRemoteDescription(sd);

      // answer the offer
      const answer = await this.subscriber.pc.createAnswer();
      await this.subscriber.pc.setLocalDescription(answer);
      this.client.sendAnswer(answer);
    };

    this.client.onParticipantUpdate = (updates) => {
      this.emit(EngineEvent.ParticipantUpdate, updates);
    };

    this.client.onLocalTrackPublished = (res: TrackPublishedResponse) => {
      const resolve = this.pendingTrackResolvers[res.cid];
      if (!resolve) {
        log.error('missing track resolver for ', res.cid);
        return;
      }
      delete this.pendingTrackResolvers[res.cid];
      resolve(res.track!);
    };

    this.client.onSpeakersChanged = (speakers) => {
      this.emit(EngineEvent.SpeakersChanged, speakers);
    };

    this.client.onClose = () => {
      this.handleDisconnect('signal');
    };

    this.client.onLeave = () => {
      this.close();
      this.emit(EngineEvent.Disconnected);
    };

    this.client.onRemoteMuteChanged = (trackSid, muted) => {
      this.emit(EngineEvent.RemoteMuteChanged, trackSid, muted);
    };

    this.client.onRoomUpdate = (room) => {
      this.emit(EngineEvent.RoomUpdate, room)
    }
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

  // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
  // continues to work, we can reconnect to websocket to continue the session
  // after a number of retries, we'll close and give up permanently
  private handleDisconnect = (connection: string) => {
    if (this.isClosed) {
      return;
    }
    log.debug(`${connection} disconnected`);
    if (this.reconnectAttempts >= maxReconnectRetries) {
      log.info(
        'could not connect to signal after',
        maxReconnectRetries,
        'attempts. giving up',
      );
      this.close();
      this.emit(EngineEvent.Disconnected);
      return;
    }

    const delay = (this.reconnectAttempts * this.reconnectAttempts) * 300;
    setTimeout(() => {
      this.reconnect()
        .then(() => {
          this.reconnectAttempts = 0;
        })
        .catch(this.handleDisconnect);
    }, delay);
  };

  private async reconnect(): Promise<void> {
    if (this.isClosed) {
      return;
    }
    if (!this.url || !this.token) {
      throw new ConnectionError('could not reconnect, url or token not saved');
    }
    log.info('reconnecting to signal connection, attempt', this.reconnectAttempts);

    if (this.reconnectAttempts === 0) {
      this.emit(EngineEvent.Reconnecting);
    }
    this.reconnectAttempts += 1;

    await this.client.reconnect(this.url, this.token);

    // trigger publisher reconnect
    if (!this.publisher || !this.subscriber) {
      throw new UnexpectedConnectionState('publisher and subscriber connections unset');
    }
    this.subscriber.restartingIce = true;

    // only restart publisher if it's needed
    if (this.hasPublished) {
      await this.publisher.createAndSendOffer({ iceRestart: true });
    }

    const startTime = (new Date()).getTime();

    while ((new Date()).getTime() - startTime < maxICEConnectTimeout * 2) {
      if (this.iceConnected) {
        // reconnect success
        this.emit(EngineEvent.Reconnected);
        return;
      }
      await sleep(100);
    }

    // have not reconnected, throw
    throw new ConnectionError('could not establish ICE connection');
  }

  /* @internal */
  async sendDataPacket(packet: DataPacket, kind: DataPacket_Kind) {
    const msg = DataPacket.encode(packet).finish();

    // make sure we do have a data connection
    await this.ensurePublisherConnected();

    if (kind === DataPacket_Kind.LOSSY && this.lossyDC) {
      this.lossyDC.send(msg);
    } else if (kind === DataPacket_Kind.RELIABLE && this.reliableDC) {
      this.reliableDC.send(msg);
    }
  }

  private async ensurePublisherConnected() {
    if (!this.subscriberPrimary) {
      return;
    }

    if (this.publisher && this.publisher.pc.iceConnectionState === 'connected') {
      return;
    }

    // start negotiation
    await this.negotiate();

    // wait until publisher ICE connected
    const endTime = (new Date()).getTime() + maxICEConnectTimeout;
    while ((new Date()).getTime() < endTime) {
      if (this.publisher && this.publisher.pc.iceConnectionState === 'connected') {
        return;
      }
      await sleep(50);
    }

    throw new ConnectionError('could not establish publisher connection');
  }

  /** @internal */
  async negotiate() {
    if (!this.publisher) {
      return;
    }

    this.hasPublished = true;

    this.publisher.negotiate();
  }
}
