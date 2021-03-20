import { EventEmitter } from 'events';
import log from 'loglevel';
import { SignalClient } from '../api/SignalClient';
import { TrackInfo } from '../proto/livekit_models';
import {
  JoinResponse,
  SignalTarget,
  TrackPublishedResponse,
} from '../proto/livekit_rtc';
import { TrackInvalidError } from './errors';
import { EngineEvent } from './events';
import { PCTransport } from './PCTransport';
import { Track } from './track/Track';

const placeholderDataChannel = '_private';
const maxWSRetries = 10;

export class RTCEngine extends EventEmitter {
  publisher!: PCTransport;
  subscriber!: PCTransport;
  client: SignalClient;
  rtcConfig: RTCConfiguration;

  privateDC?: RTCDataChannel;
  rtcConnected: boolean = false;
  iceConnected: boolean = false;
  pendingCandidates: RTCIceCandidateInit[] = [];
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
  }

  async join(url: string, token: string): Promise<JoinResponse> {
    this.url = url;
    this.token = token;

    const joinResponse = await this.client.join(url, token);

    if (joinResponse.iceServers && !this.rtcConfig.iceServers) {
      this.rtcConfig.iceServers = [];
      for (let iceServer of joinResponse.iceServers) {
        const rtcIceServer: RTCIceServer = {
          urls: iceServer.urls,
        };
        if (iceServer.username) rtcIceServer.username = iceServer.username;
        if (iceServer.credential)
          rtcIceServer.credential = iceServer.credential;
        this.rtcConfig.iceServers.push(rtcIceServer);
      }
    }

    // update ICE servers before creating PeerConnection
    if (!this.publisher) {
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
      this.subscriber.close();
    }
    this.client.close();
  }

  addTrack(cid: string, name: string, kind: Track.Kind): Promise<TrackInfo> {
    if (this.pendingTrackResolvers[cid]) {
      throw new TrackInvalidError(
        'a track with the same ID has already been published'
      );
    }
    return new Promise<TrackInfo>((resolve, reject) => {
      this.pendingTrackResolvers[cid] = resolve;
      this.client.sendAddTrack(cid, name, Track.kindToProto(kind));
    });
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
  }

  private configure() {
    this.publisher.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;

      log.trace('adding ICE candidate for peer', ev.candidate);
      // TODO: don't think we need this rtcConnected check, should be able to send
      // through right away
      if (this.rtcConnected) {
        // send it through
        this.client.sendIceCandidate(ev.candidate, SignalTarget.PUBLISHER);
      } else {
        this.pendingCandidates.push(ev.candidate);
      }
    };

    this.subscriber.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.client.sendIceCandidate(ev.candidate, SignalTarget.SUBSCRIBER);
    };

    this.publisher.pc.onnegotiationneeded = (ev) => {
      if (!this.rtcConnected) {
        return;
      }
      this.negotiate();
    };

    this.publisher.pc.oniceconnectionstatechange = (ev) => {
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
        const delay =
          this.publisher.pc.signalingState == 'have-local-offer' ? 3000 : 100;
        this.disconnectTimeout = setTimeout(() => {
          this.disconnectTimeout = undefined;
          this.iceConnected = false;
          this.emit(EngineEvent.Disconnected);
          this.close();
        }, delay);
      }
    };

    this.subscriber.pc.ontrack = (ev: RTCTrackEvent) => {
      log.debug('engine fired track added', ev.track);
      this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.receiver, ev.streams);
    };

    this.subscriber.pc.ondatachannel = (ev: RTCDataChannelEvent) => {
      this.emit(EngineEvent.DataChannelAdded, ev.channel);
    };

    // always have a blank data channel, to ensure there isn't an empty ice-ufrag
    this.privateDC = this.publisher.pc.createDataChannel(
      placeholderDataChannel
    );

    // configure signaling client
    this.client.onAnswer = async (sd) => {
      log.debug(
        'received server answer',
        sd.type,
        this.publisher.pc.signalingState
      );
      await this.publisher.setRemoteDescription(sd);

      // consider connected
      if (!this.rtcConnected) this.onRTCConnected();
    };

    // add candidate on trickle
    this.client.onTrickle = (candidate, target) => {
      log.trace('got ICE candidate from peer', candidate, target);
      if (target === SignalTarget.PUBLISHER) {
        this.publisher.addIceCandidate(candidate);
      } else {
        this.subscriber.addIceCandidate(candidate);
      }
    };

    // when server creates an offer for the client
    this.client.onOffer = async (sd) => {
      log.debug(
        'received server offer',
        sd.type,
        this.subscriber.pc.signalingState
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
  }

  // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
  // continues to work, we can reconnect to websocket to continue the session
  // after a number of retries, we'll close and give up permanently
  private handleWSClose = () => {
    if (this.numRetries >= maxWSRetries) {
      log.info(
        'could not connect to signal after',
        maxWSRetries,
        'attempts. giving up'
      );
      this.close();
      this.emit(EngineEvent.Disconnected);
      return;
    }

    const delay = (this.numRetries ^ 2) * 500;
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
    this.numRetries = this.numRetries + 1;
  };

  private async negotiate() {
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

    // send pending ICE candidates
    this.pendingCandidates.forEach((cand) => {
      this.client.sendIceCandidate(cand, SignalTarget.PUBLISHER);
    });
    this.pendingCandidates = [];
  }
}
