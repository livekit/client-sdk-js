import log from '../logger';
import {
  ClientInfo,
  ParticipantInfo,
  Room,
  SpeakerInfo,
  VideoLayer,
} from '../proto/livekit_models';
import {
  AddTrackRequest,
  ConnectionQualityUpdate,
  JoinResponse,
  LeaveRequest,
  SessionDescription,
  SignalRequest,
  SignalResponse,
  SignalTarget,
  SimulateScenario,
  StreamStateUpdate,
  SubscribedQualityUpdate,
  SubscriptionPermissionUpdate,
  SyncState,
  TrackPermission,
  TrackPublishedResponse,
  TrackUnpublishedResponse,
  UpdateSubscription,
  UpdateTrackSettings,
} from '../proto/livekit_rtc';
import { ConnectionError } from '../room/errors';
import { getClientInfo, sleep } from '../room/utils';
import Queue from './RequestQueue';
import 'webrtc-adapter';

// internal options
interface ConnectOpts {
  autoSubscribe?: boolean;
  /** internal */
  reconnect?: boolean;

  publishOnly?: string;

  adaptiveStream?: boolean;
}

// public options
export interface SignalOptions {
  autoSubscribe?: boolean;
  publishOnly?: string;
  adaptiveStream?: boolean;
}

const passThroughQueueSignals: Array<keyof SignalRequest> = [
  'syncState',
  'trickle',
  'offer',
  'answer',
  'simulate',
  'leave',
];

function canPassThroughQueue(req: SignalRequest): boolean {
  const canPass =
    Object.keys(req).find((key) => passThroughQueueSignals.includes(key as keyof SignalRequest)) !==
    undefined;
  log.trace('request allowed to bypass queue:', { canPass, req });
  return canPass;
}

/** @internal */
export class SignalClient {
  isConnected: boolean;

  isReconnecting: boolean;

  requestQueue: Queue;

  useJSON: boolean;

  /** simulate signaling latency by delaying messages */
  signalLatency?: number;

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

  onLocalTrackUnpublished?: (res: TrackUnpublishedResponse) => void;

  onTokenRefresh?: (token: string) => void;

  onLeave?: (leave: LeaveRequest) => void;

  ws?: WebSocket;

  constructor(useJSON: boolean = false) {
    this.isConnected = false;
    this.isReconnecting = false;
    this.useJSON = useJSON;
    this.requestQueue = new Queue();
  }

  async join(
    url: string,
    token: string,
    opts?: SignalOptions,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse> {
    // during a full reconnect, we'd want to start the sequence even if currently
    // connected
    this.isConnected = false;
    const res = await this.connect(
      url,
      token,
      {
        autoSubscribe: opts?.autoSubscribe,
        publishOnly: opts?.publishOnly,
        adaptiveStream: opts?.adaptiveStream,
      },
      abortSignal,
    );
    return res as JoinResponse;
  }

  async reconnect(url: string, token: string): Promise<void> {
    this.isReconnecting = true;
    await this.connect(url, token, {
      reconnect: true,
    });
  }

  connect(
    url: string,
    token: string,
    opts: ConnectOpts,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse | void> {
    if (url.startsWith('http')) {
      url = url.replace('http', 'ws');
    }
    // strip trailing slash
    url = url.replace(/\/$/, '');
    url += '/rtc';

    const clientInfo = getClientInfo();
    const params = createConnectionParams(token, clientInfo, opts);

    return new Promise<JoinResponse | void>((resolve, reject) => {
      const abortHandler = () => {
        ws.close();
        this.close();
        reject(new ConnectionError('room connection has been cancelled'));
      };
      if (abortSignal?.aborted) {
        abortHandler();
      }
      abortSignal?.addEventListener('abort', abortHandler);
      log.debug(`connecting to ${url + params}`);
      this.ws = undefined;
      const ws = new WebSocket(url + params);
      ws.binaryType = 'arraybuffer';

      ws.onerror = async (ev: Event) => {
        if (!this.ws) {
          try {
            const resp = await fetch(`http${url.substring(2)}/validate${params}`);
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

      ws.onmessage = async (ev: MessageEvent) => {
        // not considered connected until JoinResponse is received
        let msg: SignalResponse;
        if (typeof ev.data === 'string') {
          const json = JSON.parse(ev.data);
          msg = SignalResponse.fromJSON(json);
        } else if (ev.data instanceof ArrayBuffer) {
          msg = SignalResponse.decode(new Uint8Array(ev.data));
        } else {
          log.error(`could not decode websocket message: ${typeof ev.data}`);
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

        if (this.signalLatency) {
          await sleep(this.signalLatency);
        }
        this.handleSignalResponse(msg);
      };

      ws.onclose = (ev: CloseEvent) => {
        if (!this.isConnected || this.ws !== ws) return;

        log.debug(`websocket connection closed: ${ev.reason}`);
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
    console.warn('ws close call');
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
    log.trace('sending ice candidate', candidate);
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

  sendUpdateSubscriptionPermissions(allParticipants: boolean, trackPermissions: TrackPermission[]) {
    this.sendRequest({
      subscriptionPermission: {
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

  async sendRequest(req: SignalRequest, fromQueue: boolean = false) {
    // capture all requests while reconnecting and put them in a queue.
    // keep order by queueing up new events as long as the queue is not empty
    // unless the request originates from the queue, then don't enqueue again
    const canQueue = !fromQueue && !canPassThroughQueue(req);
    if (canQueue && (this.isReconnecting || !this.requestQueue.isEmpty())) {
      this.requestQueue.enqueue(() => this.sendRequest(req, true));
      return;
    }
    if (this.signalLatency) {
      await sleep(this.signalLatency);
    }
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
      log.error('error sending signal message', { error: e });
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
      const candidate: RTCIceCandidateInit = JSON.parse(msg.trickle.candidateInit);
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
        this.onLeave(msg.leave);
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
    } else if (msg.refreshToken) {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(msg.refreshToken);
      }
    } else if (msg.trackUnpublished) {
      if (this.onLocalTrackUnpublished) {
        this.onLocalTrackUnpublished(msg.trackUnpublished);
      }
    } else {
      log.debug('unsupported message', msg);
    }
  }

  setReconnected() {
    this.isReconnecting = false;
    this.requestQueue.run();
  }

  private handleWSError(ev: Event) {
    log.error('websocket error', ev);
  }
}

function fromProtoSessionDescription(sd: SessionDescription): RTCSessionDescriptionInit {
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

function createConnectionParams(token: string, info: ClientInfo, opts?: ConnectOpts): string {
  const params = new URLSearchParams();
  params.set('access_token', token);

  // opts
  if (opts?.reconnect) {
    params.set('reconnect', '1');
  }
  if (opts?.autoSubscribe !== undefined) {
    params.set('auto_subscribe', opts.autoSubscribe ? '1' : '0');
  }

  // ClientInfo
  params.set('sdk', 'js');
  params.set('version', info.version);
  params.set('protocol', info.protocol.toString());
  if (info.deviceModel) {
    params.set('device_model', info.deviceModel);
  }
  if (info.os) {
    params.set('os', info.os);
  }
  if (info.osVersion) {
    params.set('os_version', info.osVersion);
  }
  if (info.browser) {
    params.set('browser', info.browser);
  }
  if (info.browserVersion) {
    params.set('browser_version', info.browserVersion);
  }

  if (opts?.publishOnly !== undefined) {
    params.set('publish', opts.publishOnly);
  }

  if (opts?.adaptiveStream) {
    params.set('adaptive_stream', '1');
  }

  return `?${params.toString()}`;
}
