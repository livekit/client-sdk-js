import { EventEmitter } from 'events';
import log from 'loglevel';
import { ConnectionInfo, ConnectOptions, RTCClient } from '../api/RTCClient';
import { JoinResponse } from '../proto/rtc';
import { EngineEvent } from './events';

const placeholderDataChannel = '_private';

export class RTCEngine extends EventEmitter {
  peerConn: RTCPeerConnection;
  client: RTCClient;

  privateDC?: RTCDataChannel;
  rtcConnected: boolean = false;
  iceConnected: boolean = false;
  pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(client: RTCClient) {
    super();
    this.client = client;
    this.peerConn = new RTCPeerConnection();

    this.configure();
  }

  join = async (
    info: ConnectionInfo,
    token: string,
    options?: ConnectOptions
  ): Promise<JoinResponse> => {
    const joinResponse = await this.client.join(info, token, options);

    // create offer
    const offer = await this.peerConn.createOffer();
    this.peerConn.setLocalDescription(offer);

    this.client.sendOffer(offer);
    return joinResponse;
  };

  createOffer = async (): Promise<RTCSessionDescriptionInit> => {
    const offer = await this.peerConn.createOffer();
    // TODO: set bitrate and other options
    return offer;
  };

  negotiate = async () => {
    const offer = await this.createOffer();
    await this.peerConn.setLocalDescription(offer);
    this.client.sendNegotiate(offer);
  };

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
      this.negotiate();
    };

    this.peerConn.oniceconnectionstatechange = (ev) => {
      if (this.peerConn.iceConnectionState === 'connected') {
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
    this.client.onAnswer = (sd) => {
      this.peerConn.setRemoteDescription(sd).then(() => {
        // consider connected
        this.onRTCConnected();
      });
    };

    // add candidate on trickle
    this.client.onTrickle = (candidate) => {
      log.debug('got ICE candidate from peer', candidate);
      this.peerConn.addIceCandidate(candidate);
    };

    this.client.onNegotiate = (sd) => {
      this.peerConn.setRemoteDescription(sd);

      // answer the offer
      if (sd.type === 'offer') {
        this.peerConn.createAnswer().then((answer) => {
          this.peerConn.setLocalDescription(answer);
          this.client.sendNegotiate(answer);
        });
      }
    };

    this.client.onParticipantUpdate = (updates) => {
      this.emit(EngineEvent.ParticipantUpdate, updates);
    };

    this.client.onLocalTrackPublished = (ti) => {
      this.emit(EngineEvent.LocalTrackPublished, ti);
    };

    this.client.onClose = (reason) => {
      this.emit(EngineEvent.Disconnected, reason);
    };
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
