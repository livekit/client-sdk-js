import Queue from 'async-await-queue';
import 'webrtc-adapter';
import log from '../logger';
import {
  ClientInfo,
  DisconnectReason,
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

// internal options
interface ConnectOpts {
  autoSubscribe?: boolean;
  /** internal */
  reconnect?: boolean;

  /** @deprecated */
  publishOnly?: string;

  adaptiveStream?: boolean;
}

// public options
export interface SignalOptions {
  autoSubscribe?: boolean;
  /** @deprecated */
  publishOnly?: string;
  adaptiveStream?: boolean;
}

type SignalMessage = SignalRequest['message'];

type SignalKind = NonNullable<SignalMessage>['$case'];

const passThroughQueueSignals: Array<SignalKind> = [
  'syncState',
  'trickle',
  'offer',
  'answer',
  'simulate',
  'leave',
];

function canPassThroughQueue(req: SignalMessage): boolean {
  const canPass = passThroughQueueSignals.includes(req!.$case);
  log.trace('request allowed to bypass queue:', { canPass, req });
  return canPass;
}

/** @internal */
export class SignalClient {
  isConnected: boolean;

  isReconnecting: boolean;

  requestQueue: Queue;

  queuedRequests: Array<() => Promise<void>>;

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

  private pingTimeout: ReturnType<typeof setTimeout> | undefined;

  private pingTimeoutDuration: number | undefined;

  private pingIntervalDuration: number | undefined;

  private pingInterval: ReturnType<typeof setInterval> | undefined;

  constructor(useJSON: boolean = false) {
    this.isConnected = false;
    this.isReconnecting = false;
    this.useJSON = useJSON;
    this.requestQueue = new Queue();
    this.queuedRequests = [];
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
    // clear ping timeout and reset it once reconnected
    if (this.pingTimeoutDuration) {
      clearTimeout(this.pingTimeoutDuration);
    }
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
          // restart ping timeout as it's cleared for reconnection
          this.resetPingTimeout();
          resolve();
        }
      };

      ws.onmessage = async (ev: MessageEvent) => {
        // not considered connected until JoinResponse is received
        let resp: SignalResponse;
        if (typeof ev.data === 'string') {
          const json = JSON.parse(ev.data);
          resp = SignalResponse.fromJSON(json);
        } else if (ev.data instanceof ArrayBuffer) {
          resp = SignalResponse.decode(new Uint8Array(ev.data));
        } else {
          log.error(`could not decode websocket message: ${typeof ev.data}`);
          return;
        }

        if (!this.isConnected) {
          // handle join message only
          if (resp.message?.$case === 'join') {
            this.isConnected = true;
            abortSignal?.removeEventListener('abort', abortHandler);
            this.pingTimeoutDuration = resp.message.join.pingTimeout;
            this.pingIntervalDuration = resp.message.join.pingInterval;
            this.startPingInterval();
            resolve(resp.message.join);
          } else {
            reject(new ConnectionError('did not receive join response'));
          }
          return;
        }

        if (this.signalLatency) {
          await sleep(this.signalLatency);
        }
        this.handleSignalResponse(resp);
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
    this.ws = undefined;
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
    }
    this.stopPingInterval();
  }

  // initial offer after joining
  sendOffer(offer: RTCSessionDescriptionInit) {
    log.debug('sending offer', offer);
    this.sendRequest({
      $case: 'offer',
      offer: toProtoSessionDescription(offer),
    });
  }

  // answer a server-initiated offer
  sendAnswer(answer: RTCSessionDescriptionInit) {
    log.debug('sending answer');
    this.sendRequest({
      $case: 'answer',
      answer: toProtoSessionDescription(answer),
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    log.trace('sending ice candidate', candidate);
    this.sendRequest({
      $case: 'trickle',
      trickle: {
        candidateInit: JSON.stringify(candidate),
        target,
      },
    });
  }

  sendMuteTrack(trackSid: string, muted: boolean) {
    this.sendRequest({
      $case: 'mute',
      mute: {
        sid: trackSid,
        muted,
      },
    });
  }

  sendAddTrack(req: AddTrackRequest): void {
    this.sendRequest({
      $case: 'addTrack',
      addTrack: AddTrackRequest.fromPartial(req),
    });
  }

  sendUpdateTrackSettings(settings: UpdateTrackSettings) {
    this.sendRequest({
      $case: 'trackSetting',
      trackSetting: settings,
    });
  }

  sendUpdateSubscription(sub: UpdateSubscription) {
    this.sendRequest({
      $case: 'subscription',
      subscription: sub,
    });
  }

  sendSyncState(sync: SyncState) {
    this.sendRequest({
      $case: 'syncState',
      syncState: sync,
    });
  }

  sendUpdateVideoLayers(trackSid: string, layers: VideoLayer[]) {
    this.sendRequest({
      $case: 'updateLayers',
      updateLayers: {
        trackSid,
        layers,
      },
    });
  }

  sendUpdateSubscriptionPermissions(allParticipants: boolean, trackPermissions: TrackPermission[]) {
    this.sendRequest({
      $case: 'subscriptionPermission',
      subscriptionPermission: {
        allParticipants,
        trackPermissions,
      },
    });
  }

  sendSimulateScenario(scenario: SimulateScenario) {
    this.sendRequest({
      $case: 'simulate',
      simulate: scenario,
    });
  }

  sendPing() {
    this.sendRequest({
      $case: 'ping',
      ping: Date.now(),
    });
  }

  async sendLeave() {
    await this.sendRequest({
      $case: 'leave',
      leave: {
        canReconnect: false,
        reason: DisconnectReason.CLIENT_INITIATED,
      },
    });
  }

  async sendRequest(message: SignalMessage, fromQueue: boolean = false) {
    // capture all requests while reconnecting and put them in a queue
    // unless the request originates from the queue, then don't enqueue again
    const canQueue = !fromQueue && !canPassThroughQueue(message);
    if (canQueue && this.isReconnecting) {
      this.queuedRequests.push(async () => {
        await this.sendRequest(message, true);
      });
      return;
    }
    // make sure previously queued requests are being sent first
    if (!fromQueue) {
      await this.requestQueue.flush();
    }
    if (this.signalLatency) {
      await sleep(this.signalLatency);
    }
    if (!this.ws) {
      log.error('cannot send signal request before connected');
      return;
    }

    const req = {
      message,
    };
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

  private handleSignalResponse(res: SignalResponse) {
    const msg = res.message!;
    if (msg.$case === 'answer') {
      const sd = fromProtoSessionDescription(msg.answer);
      if (this.onAnswer) {
        this.onAnswer(sd);
      }
    } else if (msg.$case === 'offer') {
      const sd = fromProtoSessionDescription(msg.offer);
      if (this.onOffer) {
        this.onOffer(sd);
      }
    } else if (msg.$case === 'trickle') {
      const candidate: RTCIceCandidateInit = JSON.parse(msg.trickle.candidateInit!);
      if (this.onTrickle) {
        this.onTrickle(candidate, msg.trickle.target);
      }
    } else if (msg.$case === 'update') {
      if (this.onParticipantUpdate) {
        this.onParticipantUpdate(msg.update.participants ?? []);
      }
    } else if (msg.$case === 'trackPublished') {
      if (this.onLocalTrackPublished) {
        this.onLocalTrackPublished(msg.trackPublished);
      }
    } else if (msg.$case === 'speakersChanged') {
      if (this.onSpeakersChanged) {
        this.onSpeakersChanged(msg.speakersChanged.speakers ?? []);
      }
    } else if (msg.$case === 'leave') {
      if (this.onLeave) {
        this.onLeave(msg.leave);
      }
    } else if (msg.$case === 'mute') {
      if (this.onRemoteMuteChanged) {
        this.onRemoteMuteChanged(msg.mute.sid, msg.mute.muted);
      }
    } else if (msg.$case === 'roomUpdate') {
      if (this.onRoomUpdate && msg.roomUpdate.room) {
        this.onRoomUpdate(msg.roomUpdate.room);
      }
    } else if (msg.$case === 'connectionQuality') {
      if (this.onConnectionQuality) {
        this.onConnectionQuality(msg.connectionQuality);
      }
    } else if (msg.$case === 'streamStateUpdate') {
      if (this.onStreamStateUpdate) {
        this.onStreamStateUpdate(msg.streamStateUpdate);
      }
    } else if (msg.$case === 'subscribedQualityUpdate') {
      if (this.onSubscribedQualityUpdate) {
        this.onSubscribedQualityUpdate(msg.subscribedQualityUpdate);
      }
    } else if (msg.$case === 'subscriptionPermissionUpdate') {
      if (this.onSubscriptionPermissionUpdate) {
        this.onSubscriptionPermissionUpdate(msg.subscriptionPermissionUpdate);
      }
    } else if (msg.$case === 'refreshToken') {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(msg.refreshToken);
      }
    } else if (msg.$case === 'trackUnpublished') {
      if (this.onLocalTrackUnpublished) {
        this.onLocalTrackUnpublished(msg.trackUnpublished);
      }
    } else if (msg.pong) {
      this.resetPingTimeout();
    } else {
      log.debug('unsupported message', msg);
    }
  }

  setReconnected() {
    while (this.queuedRequests.length > 0) {
      const req = this.queuedRequests.shift();
      if (req) {
        this.requestQueue.run(req);
      }
    }
    this.isReconnecting = false;
  }

  private handleWSError(ev: Event) {
    log.error('websocket error', ev);
  }

  private resetPingTimeout() {
    if (this.pingTimeoutDuration) {
      clearTimeout(this.pingTimeoutDuration);
    }
    if (!this.pingTimeoutDuration) {
      return;
    }
    this.pingTimeout = setTimeout(() => {
      if (this.onClose) {
        this.onClose('ping timeout');
      }
    }, this.pingTimeoutDuration);
  }

  private startPingInterval() {
    this.resetPingTimeout();
    this.stopPingInterval();
    if (!this.pingIntervalDuration) {
      return;
    }
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalDuration);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
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
  params.set('version', info.version!);
  params.set('protocol', info.protocol!.toString());
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
