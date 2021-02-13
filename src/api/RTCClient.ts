import log from 'loglevel';
import 'webrtc-adapter';
import { ParticipantInfo, TrackType } from '../proto/model';
import {
  JoinResponse,
  SessionDescription,
  SignalRequest,
  SignalResponse,
  SignalTarget,
  TrackPublishedResponse,
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
  join(info: ConnectionInfo, token: string): Promise<JoinResponse>;
  sendOffer(offer: RTCSessionDescriptionInit): void;
  sendAnswer(answer: RTCSessionDescriptionInit): void;
  sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget): void;
  sendMuteTrack(trackSid: string, muted: boolean): void;
  sendAddTrack(cid: string, name: string, type: TrackType): void;
  close(): void;

  readonly isConnected: boolean;

  // callbacks
  onClose?: (reason: string) => void;
  // server answered
  onAnswer?: (sd: RTCSessionDescriptionInit) => void;
  // handle server initiated negotiation
  onOffer?: (sd: RTCSessionDescriptionInit) => void;
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit, target: SignalTarget) => void;
  // when a participant has changed
  onParticipantUpdate?: (updates: ParticipantInfo[]) => void;
  // when track is published successfully
  onLocalTrackPublished?: (res: TrackPublishedResponse) => void;
}

export class RTCClientImpl {
  isConnected: boolean;
  onClose?: (reason: string) => void;
  onAnswer?: (sd: RTCSessionDescriptionInit) => void;
  onOffer?: (sd: RTCSessionDescriptionInit) => void;
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit, target: SignalTarget) => void;
  onParticipantUpdate?: (updates: ParticipantInfo[]) => void;
  onLocalTrackPublished?: (res: TrackPublishedResponse) => void;
  onNegotiateRequested?: () => void;

  ws?: WebSocket;

  constructor() {
    this.isConnected = false;
  }

  join(info: ConnectionInfo, token: string): Promise<JoinResponse> {
    const protocol = info.secure ? 'wss' : 'ws';
    let url = `${protocol}://${info.host}:${info.port}/rtc?access_token=${token}`;

    return new Promise<JoinResponse>((resolve, reject) => {
      log.debug('connecting to', url);
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

        log.debug('websocket connection closed', ev.reason);
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

  // initial offer after joining
  sendOffer(offer: RTCSessionDescriptionInit) {
    log.debug('sending offer', offer);
    this.sendRequest({
      offer: toProtoSessionDescription(offer),
    });
  }

  // answer a server-initiated offer
  sendAnswer(answer: RTCSessionDescriptionInit) {
    log.debug('sending answer');
    this.sendRequest({
      answer: toProtoSessionDescription(answer),
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    log.debug('sending ice candidate', candidate);
    this.sendRequest({
      trickle: {
        candidateInit: JSON.stringify(candidate),
        target: target,
      },
    });
  }

  sendMuteTrack(trackSid: string, muted: boolean) {
    this.sendRequest({
      mute: {
        sid: trackSid,
        muted: muted,
      },
    });
  }

  sendAddTrack(cid: string, name: string, type: TrackType): void {
    this.sendRequest({
      addTrack: {
        cid,
        name,
        type,
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
    } else if (msg.offer) {
      const sd = fromProtoSessionDescription(msg.offer);
      if (this.onOffer) {
        this.onOffer(sd);
      }
    } else if (msg.trickle) {
      const candidate: RTCIceCandidateInit = JSON.parse(
        msg.trickle.candidateInit
      );
      if (this.onTrickle) {
        this.onTrickle(candidate, msg.trickle.target);
      }
    } else if (msg.update) {
      if (this.onParticipantUpdate) {
        this.onParticipantUpdate(msg.update.participants);
      }
    } else if (msg.trackPublished) {
      if (this.onLocalTrackPublished) {
        this.onLocalTrackPublished(msg.trackPublished);
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
