import 'webrtc-adapter';
import log from '../logger';
import {
  ParticipantInfo, Room, SpeakerInfo, VideoLayer,
} from '../proto/livekit_models';
import {
  AddTrackRequest,
  ConnectionQualityUpdate,
  JoinResponse,
  SessionDescription,
  SignalRequest,
  SignalResponse,
  SignalTarget, SimulateScenario,
  StreamStateUpdate,
  SubscribedQualityUpdate,
  SubscriptionPermissionUpdate, SyncState, TrackPermission,
  TrackPublishedResponse,
  UpdateSubscription, UpdateTrackSettings,
} from '../proto/livekit_rtc';
import { ConnectionError } from '../room/errors';
import { protocolVersion, version } from '../version';

// internal options
interface ConnectOpts {
  autoSubscribe?: boolean;
  /** internal */
  reconnect?: boolean;
}

// public options
export interface SignalOptions {
  autoSubscribe?: boolean;
}

/** @internal */
export class SignalClient {
  isConnected: boolean;

  useJSON: boolean;

  onClose?: (reason: string) => void;

  onAnswer?: (sd: RTCSessionDescriptionInit) => void;

  onOffer?: (sd: RTCSessionDescriptionInit) => void;

  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit, target: SignalTarget) => void;

  onParticipantUpdate?: (updates: ParticipantInfo[]) => void;

  onLocalTrackPublished?: (res: TrackPublishedResponse) => void;

  onNegotiateRequested?: () => void;

  onSpeakersChanged?: (res: SpeakerInfo[]) => void;

  onRemoteMuteChanged?: (trackSid: string, muted: boolean) => void;

  onRoomUpdate?: (room: Room) => void;

  onConnectionQuality?: (update: ConnectionQualityUpdate) => void;

  onStreamStateUpdate?: (update: StreamStateUpdate) => void;

  onSubscribedQualityUpdate?: (update: SubscribedQualityUpdate) => void;

  onSubscriptionPermissionUpdate?: (update: SubscriptionPermissionUpdate) => void;

  onLeave?: () => void;

  ws?: WebSocket;

  constructor(useJSON: boolean = false) {
    this.isConnected = false;
    this.useJSON = useJSON;
  }

  async join(
    url: string,
    token: string,
    opts?: SignalOptions,
  ): Promise<JoinResponse> {
    const res = await this.connect(url, token, {
      autoSubscribe: opts?.autoSubscribe,
    });
    return res as JoinResponse;
  }

  async reconnect(url: string, token: string): Promise<void> {
    await this.connect(url, token, {
      reconnect: true,
    });
  }

  connect(
    url: string,
    token: string,
    opts: ConnectOpts,
  ): Promise<JoinResponse | void> {
    if (url.startsWith('http')) {
      url = url.replace('http', 'ws');
    }
    // strip trailing slash
    url = url.replace(/\/$/, '');
    url += '/rtc';
    let params = `?access_token=${token}&protocol=${protocolVersion}&sdk=js&version=${version}`;
    if (opts.reconnect) {
      params += '&reconnect=1';
    }
    if (opts.autoSubscribe !== undefined) {
      params += `&auto_subscribe=${opts.autoSubscribe ? '1' : '0'}`;
    }

    return new Promise<JoinResponse | void>((resolve, reject) => {
      log.debug('connecting to', url + params);
      this.ws = undefined;
      const ws = new WebSocket(url + params);
      ws.binaryType = 'arraybuffer';

      ws.onerror = async (ev: Event) => {
        if (!this.ws) {
          try {
            const resp = await fetch(`http${url.substr(2)}/validate${params}`);
            if (!resp.ok) {
              const msg = await resp.text();
              reject(new ConnectionError(msg));
            } else {
              reject(new ConnectionError('Internal error'));
            }
          } catch (e) {
            reject(new ConnectionError('server was not reachable'));
          }
          return;
        }
        // other errors, handle
        this.handleWSError(ev);
      };

      ws.onopen = () => {
        this.ws = ws;
        if (opts.reconnect) {
          // upon reconnection, there will not be additional handshake
          this.isConnected = true;
          resolve();
        }
      };

      ws.onmessage = (ev: MessageEvent) => {
        // not considered connected until JoinResponse is received
        let msg: SignalResponse;
        if (typeof ev.data === 'string') {
          const json = JSON.parse(ev.data);
          msg = SignalResponse.fromJSON(json);
        } else if (ev.data instanceof ArrayBuffer) {
          msg = SignalResponse.decode(new Uint8Array(ev.data));
        } else {
          log.error('could not decode websocket message', typeof ev.data);
          return;
        }

        if (!this.isConnected) {
          // handle join message only
          if (msg.join) {
            this.isConnected = true;
            resolve(msg.join);
          } else {
            reject(new ConnectionError('did not receive join response'));
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
        if (this.ws === ws) {
          this.ws = undefined;
        }
      };
    });
  }

  close() {
    this.isConnected = false;
    if (this.ws) this.ws.onclose = null;
    this.ws?.close();
    this.ws = undefined;
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
        target,
      },
    });
  }

  sendMuteTrack(trackSid: string, muted: boolean) {
    this.sendRequest({
      mute: {
        sid: trackSid,
        muted,
      },
    });
  }

  sendAddTrack(req: AddTrackRequest): void {
    this.sendRequest({
      addTrack: AddTrackRequest.fromPartial(req),
    });
  }

  sendUpdateTrackSettings(settings: UpdateTrackSettings) {
    this.sendRequest({ trackSetting: settings });
  }

  sendUpdateSubscription(sub: UpdateSubscription) {
    this.sendRequest({ subscription: sub });
  }

  sendSyncState(sync: SyncState) {
    this.sendRequest({ syncState: sync });
  }

  sendUpdateVideoLayers(trackSid: string, layers: VideoLayer[]) {
    this.sendRequest({
      updateLayers: {
        trackSid,
        layers,
      },
    });
  }

  sendUpdateSubscriptionPermissions(
    allParticipants: boolean,
    trackPermissions: TrackPermission[],
  ) {
    this.sendRequest({
      subscriptionPermissions: {
        allParticipants,
        trackPermissions,
      },
    });
  }

  sendSimulateScenario(scenario: SimulateScenario) {
    this.sendRequest({
      simulate: scenario,
    });
  }

  sendLeave() {
    this.sendRequest(SignalRequest.fromPartial({ leave: {} }));
  }

  sendRequest(req: SignalRequest) {
    if (!this.ws) {
      log.error('cannot send signal request before connected');
      return;
    }

    try {
      if (this.useJSON) {
        this.ws.send(JSON.stringify(SignalRequest.toJSON(req)));
      } else {
        this.ws.send(SignalRequest.encode(req).finish());
      }
    } catch (e) {
      log.error('error sending signal message', e);
    }
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
        msg.trickle.candidateInit,
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
    } else if (msg.speakersChanged) {
      if (this.onSpeakersChanged) {
        this.onSpeakersChanged(msg.speakersChanged.speakers);
      }
    } else if (msg.leave) {
      if (this.onLeave) {
        this.onLeave();
      }
    } else if (msg.mute) {
      if (this.onRemoteMuteChanged) {
        this.onRemoteMuteChanged(msg.mute.sid, msg.mute.muted);
      }
    } else if (msg.roomUpdate) {
      if (this.onRoomUpdate) {
        this.onRoomUpdate(msg.roomUpdate.room!);
      }
    } else if (msg.connectionQuality) {
      if (this.onConnectionQuality) {
        this.onConnectionQuality(msg.connectionQuality);
      }
    } else if (msg.streamStateUpdate) {
      if (this.onStreamStateUpdate) {
        this.onStreamStateUpdate(msg.streamStateUpdate);
      }
    } else if (msg.subscribedQualityUpdate) {
      if (this.onSubscribedQualityUpdate) {
        this.onSubscribedQualityUpdate(msg.subscribedQualityUpdate);
      }
    } else if (msg.subscriptionPermissionUpdate) {
      if (this.onSubscriptionPermissionUpdate) {
        this.onSubscriptionPermissionUpdate(msg.subscriptionPermissionUpdate);
      }
    } else {
      log.debug('unsupported message', msg);
    }
  }

  private handleWSError(ev: Event) {
    log.error('websocket error', ev);
  }
}

function fromProtoSessionDescription(
  sd: SessionDescription,
): RTCSessionDescriptionInit {
  const rsd: RTCSessionDescriptionInit = {
    type: 'offer',
    sdp: sd.sdp,
  };
  switch (sd.type) {
    case 'answer':
    case 'offer':
    case 'pranswer':
    case 'rollback':
      rsd.type = sd.type;
      break;
    default:
      break;
  }
  return rsd;
}

export function toProtoSessionDescription(
  rsd: RTCSessionDescription | RTCSessionDescriptionInit,
): SessionDescription {
  const sd: SessionDescription = {
    sdp: rsd.sdp!,
    type: rsd.type!,
  };
  return sd;
}
