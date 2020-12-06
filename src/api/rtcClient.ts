import 'webrtc-adapter';
import { ParticipantInfo } from '../proto/model';
import {
  JoinResponse,
  SessionDescription,
  SignalRequest,
  SignalResponse,
} from '../proto/rtc';

export interface ConnectionInfo {
  host: string;
  port: number;
  secure?: boolean;
}

/**
 * RTCClient is the signaling layer of WebRTC, it's LiveKit's signaling protocol
 * so that it
 */
export interface RTCClient {
  join(
    info: ConnectionInfo,
    roomId: string,
    token: string,
    options?: JoinOptions
  ): Promise<JoinResponse>;
  sendOffer(offer: RTCSessionDescriptionInit): void;
  sendNegotiate(offer: RTCSessionDescriptionInit): void;
  sendIceCandidate(candidate: RTCIceCandidateInit): void;

  readonly isConnected: boolean;

  // callbacks
  onClose?: (reason: string) => void;
  // server answered
  onAnswer?: (sd: RTCSessionDescriptionInit) => void;
  // handle negotiation, expect both offer and answer
  onNegotiate?: (sd: RTCSessionDescriptionInit) => void;
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit) => void;
  // when a participant has changed
  onParticipantUpdate?: (updates: ParticipantInfo[]) => void;
}

export interface JoinOptions {
  name?: string;
}

export class RTCClientImpl {
  isConnected: boolean;
  onClose?: (reason: string) => void;
  onAnswer?: (sd: RTCSessionDescriptionInit) => void;
  // handle negotiation, expect both offer and answer
  onNegotiate?: (sd: RTCSessionDescriptionInit) => void;
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit) => void;
  onParticipantUpdate?: (updates: ParticipantInfo[]) => void;

  ws?: WebSocket;

  constructor() {
    this.isConnected = false;
  }

  join(
    info: ConnectionInfo,
    roomId: string,
    token: string,
    options?: JoinOptions
  ): Promise<JoinResponse> {
    const protocol = info.secure ? 'wss' : 'ws';
    let url = `${protocol}://${info.host}:${info.port}/rtc?room_id=${roomId}&token=${token}`;

    if (options && options.name) {
      url += '&name=' + encodeURIComponent(options.name);
    }

    return new Promise<JoinResponse>((resolve, reject) => {
      console.debug('connecting to', url);
      const ws = new WebSocket(url);
      ws.onerror = (ev: Event) => {
        if (!this.ws) {
          // not yet connected, reject
          reject('Could not connect');
          return;
        }
        // other errors, handle
        this.handleWSError(ev);
      };

      ws.onopen = (ev: Event) => {
        this.ws = ws;
      };

      ws.onmessage = (ev: MessageEvent) => {
        // not considered connected until JoinResponse is received
        const json = JSON.parse(ev.data);
        const msg = SignalResponse.fromJSON(json);

        if (!this.isConnected) {
          // handle join message only
          if (msg.join) {
            this.isConnected = true;
            resolve(msg.join);
          } else {
            reject('did not receive join response');
          }
          return;
        }

        this.handleSignalResponse(msg);
      };

      ws.onclose = (ev: CloseEvent) => {
        if (!this.isConnected) return;

        console.debug('websocket connection closed', ev.reason);
        this.isConnected = false;
        if (this.onClose) this.onClose(ev.reason);
      };
    });
  }

  close() {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.ws?.close();
    if (this.onClose && wasConnected) {
      this.onClose('client requested close');
    }
  }

  sendOffer(offer: RTCSessionDescriptionInit) {
    console.debug('sending offer', offer);
    this.sendRequest({
      offer: toProtoSessionDescription(offer),
    });
  }

  sendNegotiate(negotiate: RTCSessionDescriptionInit) {
    console.debug('sending negotiate', negotiate.type);
    this.sendRequest({
      negotiate: toProtoSessionDescription(negotiate),
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit) {
    console.debug('sending ice candidate', candidate);
    this.sendRequest({
      trickle: {
        candidateInit: JSON.stringify(candidate),
      },
    });
  }

  sendRequest(req: SignalRequest) {
    if (!this.ws) {
      throw 'cannot send signal request before connected';
    }

    const msg = SignalRequest.toJSON(req);
    this.ws.send(JSON.stringify(msg));
  }

  private handleSignalResponse(msg: SignalResponse) {
    if (msg.answer) {
      const sd = fromProtoSessionDescription(msg.answer);
      if (this.onAnswer) {
        this.onAnswer(sd);
      }
    } else if (msg.negotiate) {
      const sd = fromProtoSessionDescription(msg.negotiate);
      if (this.onNegotiate) {
        this.onNegotiate(sd);
      }
    } else if (msg.trickle) {
      const candidate: RTCIceCandidateInit = JSON.parse(
        msg.trickle.candidateInit
      );
      if (this.onTrickle) {
        this.onTrickle(candidate);
      }
    } else if (msg.update) {
      if (this.onParticipantUpdate) {
        this.onParticipantUpdate(msg.update.participants);
      }
    } else {
      console.warn('unsupported message', msg);
    }
  }

  private handleWSError(ev: Event) {
    console.error('websocket error', ev);
  }
}

function fromProtoSessionDescription(
  sd: SessionDescription
): RTCSessionDescriptionInit {
  const rsd: RTCSessionDescriptionInit = {
    sdp: sd.sdp,
  };
  switch (sd.type) {
    case 'answer':
    case 'offer':
    case 'pranswer':
    case 'rollback':
      rsd.type = sd.type;
  }
  return rsd;
}

function toProtoSessionDescription(
  rsd: RTCSessionDescription | RTCSessionDescriptionInit
): SessionDescription {
  const sd: SessionDescription = {
    sdp: rsd.sdp!,
    type: rsd.type!,
  };
  return sd;
}
