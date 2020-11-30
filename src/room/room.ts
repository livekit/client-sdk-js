import { EventEmitter } from 'events';
import { ConnectionInfo, RTCClient } from '../api/rtcClient';
import { RoomEvent } from './events';

class Room extends EventEmitter {
  client: RTCClient;
  roomId: string;
  peerConn: RTCPeerConnection;

  rtcConnected: boolean = false;
  iceConnected: boolean = false;
  pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(client: RTCClient, roomId: string) {
    super();
    this.client = client;
    this.roomId = roomId;
    this.peerConn = new RTCPeerConnection();

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
      this.iceConnected = this.peerConn.iceConnectionState === 'connected';
    };

    this.peerConn.ontrack = this.onTrack;

    // configure signaling client
    this.client.onAnswer = (sd) => {
      this.peerConn.setRemoteDescription(sd).then(() => {
        // consider connected
        this.onConnected();
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

  connect = async (info: ConnectionInfo, token: string): Promise<Room> => {
    const participantInfo = await this.client.join(info, this.roomId, token);

    // create offer
    const offer = await this.peerConn.createOffer();
    this.peerConn.setLocalDescription(offer);

    this.client.sendOffer(offer);

    return this;
  };

  negotiate = async () => {
    const offer = await this.peerConn.createOffer();
    await this.peerConn.setLocalDescription(offer);
    this.client.sendNegotiate(offer);
  };

  // signaling channel connected
  private onConnected() {
    this.rtcConnected = true;

    // send pending ICE candidates
    this.pendingCandidates.forEach((cand) => {
      this.client.sendIceCandidate(cand);
    });
    this.pendingCandidates = [];

    this.emit(RoomEvent.Connected);
  }

  private onTrack(ev: RTCTrackEvent) {
    // TODO: handle track
    console.log('remote track added', ev);
  }
}

export default Room;
