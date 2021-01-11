import { EventEmitter } from 'events';
import log from 'loglevel';
import { ConnectionInfo, RTCClient } from '../api/RTCClient';
import { TrackInfo } from '../proto/model';
import { JoinResponse, TrackPublishedResponse } from '../proto/rtc';
import { TrackInvalidError } from './errors';
import { EngineEvent } from './events';
import { Track } from './track/Track';

const placeholderDataChannel = '_private';

export class RTCEngine extends EventEmitter {
  peerConn: RTCPeerConnection;
  client: RTCClient;

  privateDC?: RTCDataChannel;
  rtcConnected: boolean = false;
  iceConnected: boolean = false;
  pendingCandidates: RTCIceCandidateInit[] = [];
  pendingTrackResolvers: { [key: string]: (info: TrackInfo) => void } = {};

  constructor(client: RTCClient) {
    super();
    this.client = client;
    this.peerConn = new RTCPeerConnection();

    this.configure();
  }

  join = async (info: ConnectionInfo, token: string): Promise<JoinResponse> => {
    const joinResponse = await this.client.join(info, token);

    // create offer
    const offer = await this.peerConn.createOffer();
    await this.peerConn.setLocalDescription(offer);

    this.client.sendOffer(offer);
    return joinResponse;
  };

  createOffer = async (): Promise<RTCSessionDescriptionInit> => {
    const offer = await this.peerConn.createOffer();
    // TODO: set bitrate and other options
    return offer;
  };

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

  removeTrack(sid: string) {
    this.client.sendRemoveTrack(sid);
  }

  updateMuteStatus(trackSid: string, muted: boolean) {
    this.client.sendMuteTrack(trackSid, muted);
  }

  private configure() {
    this.peerConn.onicecandidate = (ev) => {
      if (!ev.candidate) return;

      log.trace('adding ICE candidate for peer', ev.candidate);
      if (this.rtcConnected) {
        // send it through
        this.client.sendIceCandidate(ev.candidate);
      } else {
        this.pendingCandidates.push(ev.candidate);
      }
    };

    this.peerConn.onnegotiationneeded = (ev) => {
      if (!this.rtcConnected) {
        return;
      }
      this.requestNegotiation();
    };

    this.peerConn.oniceconnectionstatechange = (ev) => {
      if (
        this.peerConn.iceConnectionState === 'connected' &&
        !this.iceConnected
      ) {
        this.onICEConnected();
      }
      // TODO: handle other connection states
    };

    this.peerConn.ontrack = (ev: RTCTrackEvent) => {
      this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.streams);
    };

    this.peerConn.ondatachannel = (ev: RTCDataChannelEvent) => {
      this.emit(EngineEvent.DataChannelAdded, ev.channel);
    };

    // always have a blank data channel, to ensure there isn't an empty ice-ufrag
    this.privateDC = this.peerConn.createDataChannel(placeholderDataChannel);

    // configure signaling client
    this.client.onAnswer = async (sd) => {
      await this.peerConn.setRemoteDescription(sd);

      // consider connected
      if (!this.rtcConnected) this.onRTCConnected();
    };

    // add candidate on trickle
    this.client.onTrickle = (candidate) => {
      log.debug('got ICE candidate from peer', candidate);
      this.peerConn.addIceCandidate(candidate);
    };

    // when server creates an offer for the client
    this.client.onOffer = async (sd) => {
      log.debug('received offer, signalingState', this.peerConn.signalingState);
      await this.peerConn.setRemoteDescription(sd);

      // answer the offer
      const answer = await this.peerConn.createAnswer();
      await this.peerConn.setLocalDescription(answer);
      this.client.sendAnswer(answer);
    };

    this.client.onNegotiateRequested = () => {
      this.negotiate();
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

    this.client.onClose = (reason) => {
      this.emit(EngineEvent.Disconnected, reason);
    };
  }

  private async negotiate() {
    // TODO: what if signaling state changed? will need to queue and retry
    log.debug('starting to negotiate', this.peerConn.signalingState);
    const offer = await this.peerConn.createOffer();
    await this.peerConn.setLocalDescription(offer);
    this.client.sendOffer(offer);
  }

  private requestNegotiation() {
    log.debug('requesting negotiation');
    this.client.sendNegotiate();
  }

  // signaling channel connected
  private onRTCConnected() {
    log.debug('RTC connected');
    this.rtcConnected = true;

    // send pending ICE candidates
    this.pendingCandidates.forEach((cand) => {
      this.client.sendIceCandidate(cand);
    });
    this.pendingCandidates = [];
  }

  private onICEConnected() {
    log.debug('ICE connected');
    this.iceConnected = true;
  }
}
