import { EventEmitter } from 'events';
import { ConnectionInfo, RTCClient } from '../api/rtcClient';
import { ParticipantInfo } from '../proto/model';
import { EngineEvent, RoomEvent } from './events';

export class RTCEngine extends EventEmitter {
  peerConn: RTCPeerConnection;
  client: RTCClient;

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
    roomId: string,
    token: string
  ): Promise<ParticipantInfo> => {
    const participantInfo = await this.client.join(info, roomId, token);

    // create offer
    const offer = await this.peerConn.createOffer();
    this.peerConn.setLocalDescription(offer);

    this.client.sendOffer(offer);
    return participantInfo;
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

  private configure() {
    this.peerConn.onicecandidate = (ev) => {
      if (!ev.candidate) return;

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
      this.emit(EngineEvent.TrackAdded, ev.track, ev.streams);
    };

    // configure signaling client
    this.client.onAnswer = (sd) => {
      this.peerConn.setRemoteDescription(sd).then(() => {
        // consider connected
        this.onRTCConnected();
      });
    };

    // add candidate on trickle
    this.client.onTrickle = this.peerConn.addIceCandidate;

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
  }

  // signaling channel connected
  private onRTCConnected() {
    this.rtcConnected = true;

    // send pending ICE candidates
    this.pendingCandidates.forEach((cand) => {
      this.client.sendIceCandidate(cand);
    });
    this.pendingCandidates = [];

    this.emit(RoomEvent.Connected);
  }

  private onICEConnected() {
    this.iceConnected = true;
  }
}
