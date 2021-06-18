import { EventEmitter } from 'events';
import log from 'loglevel';
import { SignalClient, SignalOptions } from '../api/SignalClient';
import { TrackInfo } from '../proto/livekit_models';
import {
  DataPacket,
  JoinResponse,
  SignalTarget,
  TrackPublishedResponse,
} from '../proto/livekit_rtc';
import { TrackInvalidError } from './errors';
import { EngineEvent } from './events';
import PCTransport from './PCTransport';
import { Track } from './track/Track';
import { useLegacyAPI } from './utils';

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';
const maxWSRetries = 10;

export default class RTCEngine extends EventEmitter {
  publisher?: PCTransport;

  subscriber?: PCTransport;

  client: SignalClient;

  rtcConfig: RTCConfiguration;

  useLegacy: boolean;

  lossyDC?: RTCDataChannel;

  reliableDC?: RTCDataChannel;

  rtcConnected: boolean = false;

  iceConnected: boolean = false;

  pendingTrackResolvers: { [key: string]: (info: TrackInfo) => void } = {};

  disconnectTimeout?: ReturnType<typeof setTimeout>;

  // keep join info around for reconnect
  url?: string;

  token?: string;

  numRetries: number;

  constructor(client: SignalClient, config?: RTCConfiguration) {
    super();
    this.client = client;
    this.rtcConfig = config || {};
    this.numRetries = 0;
    this.useLegacy = useLegacyAPI();
    log.trace('creating RTCEngine', 'useLegacy', this.useLegacy);
  }

  async join(url: string, token: string, opts?: SignalOptions): Promise<JoinResponse> {
    this.url = url;
    this.token = token;

    const joinResponse = await this.client.join(url, token, this.useLegacy, opts);

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

    // update ICE servers before creating PeerConnection
    if (!this.publisher) {
      const conf: any = this.rtcConfig;
      if (this.useLegacy) {
        conf.sdpSemantics = 'plan-b';
      }
      this.publisher = new PCTransport(this.rtcConfig);
      this.subscriber = new PCTransport(this.rtcConfig);
      this.configure();
    }

    // create offer
    const offer = await this.publisher.pc.createOffer();
    await this.publisher.pc.setLocalDescription(offer);

    this.client.sendOffer(offer);
    return joinResponse;
  }

  close() {
    if (this.publisher) {
      this.publisher.close();
      this.publisher = undefined;
    }
    if (this.subscriber) {
      this.subscriber.close();
      this.subscriber = undefined;
    }
    this.client.close();
  }

  addTrack(
    cid: string,
    name: string,
    kind: Track.Kind,
    dimension?: Track.Dimension,
  ): Promise<TrackInfo> {
    if (this.pendingTrackResolvers[cid]) {
      throw new TrackInvalidError(
        'a track with the same ID has already been published',
      );
    }
    return new Promise<TrackInfo>((resolve) => {
      this.pendingTrackResolvers[cid] = resolve;
      this.client.sendAddTrack(cid, name, Track.kindToProto(kind), dimension);
    });
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
  }

  private configure() {
    if (!this.publisher || !this.subscriber) {
      return;
    }

    this.publisher.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;

      log.trace('adding ICE candidate for peer', ev.candidate);
      this.client.sendIceCandidate(ev.candidate, SignalTarget.PUBLISHER);
    };

    this.subscriber.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.client.sendIceCandidate(ev.candidate, SignalTarget.SUBSCRIBER);
    };

    this.publisher.pc.onnegotiationneeded = () => {
      if (!this.rtcConnected) {
        return;
      }
      this.negotiate();
    };

    this.publisher.pc.oniceconnectionstatechange = () => {
      if (!this.publisher) {
        return;
      }
      if (this.publisher.pc.iceConnectionState === 'connected') {
        log.trace('ICE connected');
        if (this.disconnectTimeout) {
          clearTimeout(this.disconnectTimeout);
          this.disconnectTimeout = undefined;
        }
        if (!this.iceConnected) {
          this.iceConnected = true;
          this.emit(EngineEvent.Connected);
        }
      } else if (this.publisher.pc.iceConnectionState === 'disconnected') {
        log.trace('ICE disconnected');
        if (this.disconnectTimeout) {
          return;
        }
        // Safari sends ICE disconnect during negotiation, it'll reconnect
        // once server responds
        // We'll trigger disconnect after a long delay if we are in the waiting-for-server-answer
        // state
        const delay = this.publisher.pc.signalingState === 'have-local-offer' ? 3000 : 100;
        this.disconnectTimeout = setTimeout(() => {
          this.disconnectTimeout = undefined;
          this.iceConnected = false;
          this.emit(EngineEvent.Disconnected);
          this.close();
        }, delay);
      }
    };

    if (this.useLegacy) {
      this.subscriber.pc.addEventListener('addstream', (ev: any) => {
        const { stream } = ev;
        stream.getTracks().forEach((t: MediaStreamTrack) => {
          this.emitTrackEvent(t, stream);
        });
      });
    } else {
      this.subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
        this.emitTrackEvent(ev.track, ev.streams[0], ev.receiver);
      };
    }

    // data channels
    this.lossyDC = this.publisher.pc.createDataChannel(lossyDataChannel, {
      // will drop older packets that arrive
      ordered: true,
      maxRetransmits: 1,
    });
    this.reliableDC = this.publisher.pc.createDataChannel(reliableDataChannel, {
      ordered: true,
    });

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

      // consider connected
      if (!this.rtcConnected) this.onRTCConnected();
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

    this.client.onActiveSpeakersChanged = (speakers) => {
      this.emit(EngineEvent.SpeakersUpdate, speakers);
    };

    this.client.onClose = this.handleWSClose;

    this.client.onLeave = () => {
      this.close();
      this.emit(EngineEvent.Disconnected);
    };
  }

  private handleDataMessage = (message: MessageEvent) => {
    // decode
    const dp = DataPacket.decode(new Uint8Array(message.data));
    if (dp.speaker) {
      // dispatch speaker updates
      this.emit(EngineEvent.SpeakersUpdate, dp.speaker.speakers);
    } else if (dp.user) {
      this.emit(EngineEvent.DataPacketReceived, dp.user, dp.kind);
    }
  };

  // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
  // continues to work, we can reconnect to websocket to continue the session
  // after a number of retries, we'll close and give up permanently
  private handleWSClose = () => {
    if (!this.iceConnected) {
      return;
    }
    if (this.numRetries >= maxWSRetries) {
      log.info(
        'could not connect to signal after',
        maxWSRetries,
        'attempts. giving up',
      );
      this.close();
      this.emit(EngineEvent.Disconnected);
      return;
    }

    const delay = (this.numRetries * this.numRetries) * 500;
    setTimeout(() => {
      if (this.iceConnected && this.url && this.token) {
        log.info('reconnecting to signal connection, attempt', this.numRetries);
        this.client
          .reconnect(this.url, this.token)
          .then(() => {
            this.numRetries = 0;
          })
          .catch(this.handleWSClose);
      }
    }, delay);
    this.numRetries += 1;
  };

  private async negotiate() {
    if (!this.publisher) {
      return;
    }
    // TODO: what if signaling state changed? will need to queue and retry
    log.debug('starting to negotiate', this.publisher.pc.signalingState);
    const offer = await this.publisher.pc.createOffer();
    await this.publisher.pc.setLocalDescription(offer);
    this.client.sendOffer(offer);
  }

  // signaling channel connected
  private onRTCConnected() {
    log.debug('RTC connected');
    this.rtcConnected = true;
  }

  private emitTrackEvent = (
    track: MediaStreamTrack,
    stream: MediaStream,
    receiver?: RTCRtpReceiver,
  ) => {
    this.emit(EngineEvent.MediaTrackAdded, track, stream, receiver);
  };
}
