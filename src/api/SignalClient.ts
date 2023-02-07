import Queue from 'async-await-queue';
import 'webrtc-adapter';
import log from '../logger';
import {
  ClientInfo,
  DisconnectReason,
  ParticipantInfo,
  ReconnectReason,
  Room,
  SpeakerInfo,
  VideoLayer,
} from '../proto/livekit_models';
import {
  AddTrackRequest,
  ConnectionQualityUpdate,
  JoinResponse,
  LeaveRequest,
  ReconnectResponse,
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
import { ConnectionError, ConnectionErrorReason } from '../room/errors';
import CriticalTimers from '../room/timers';
import { getClientInfo, Mutex, sleep } from '../room/utils';

// internal options
interface ConnectOpts {
  autoSubscribe: boolean;
  /** internal */
  reconnect?: boolean;

  /** internal */
  reconnectReason?: number;

  /** internal */
  sid?: string;

  /** @deprecated */
  publishOnly?: string;

  adaptiveStream?: boolean;
}

// public options
export interface SignalOptions {
  autoSubscribe: boolean;
  /** @deprecated */
  publishOnly?: string;
  adaptiveStream?: boolean;
  maxRetries: number;
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

  /** signal rtt in milliseconds */
  rtt: number = 0;

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

  connectOptions?: ConnectOpts;

  ws?: WebSocket;

  private options?: SignalOptions;

  private pingTimeout: ReturnType<typeof setTimeout> | undefined;

  private pingTimeoutDuration: number | undefined;

  private pingIntervalDuration: number | undefined;

  private pingInterval: ReturnType<typeof setInterval> | undefined;

  private closingLock: Mutex;

  constructor(useJSON: boolean = false) {
    this.isConnected = false;
    this.isReconnecting = false;
    this.useJSON = useJSON;
    this.requestQueue = new Queue();
    this.queuedRequests = [];
    this.closingLock = new Mutex();
  }

  async join(
    url: string,
    token: string,
    opts: SignalOptions,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse> {
    // during a full reconnect, we'd want to start the sequence even if currently
    // connected
    this.isConnected = false;
    this.options = opts;
    const res = await this.connect(url, token, opts, abortSignal);
    return res as JoinResponse;
  }

  async reconnect(
    url: string,
    token: string,
    sid?: string,
    reason?: ReconnectReason,
  ): Promise<ReconnectResponse | void> {
    if (!this.options) {
      log.warn('attempted to reconnect without signal options being set, ignoring');
      return;
    }
    this.isReconnecting = true;
    // clear ping interval and restart it once reconnected
    this.clearPingInterval();

    const res = await this.connect(url, token, {
      ...this.options,
      reconnect: true,
      sid,
      reconnectReason: reason,
    });
    return res;
  }

  connect(
    url: string,
    token: string,
    opts: ConnectOpts,
    abortSignal?: AbortSignal,
  ): Promise<JoinResponse | ReconnectResponse | void> {
    this.connectOptions = opts;
    if (url.startsWith('http')) {
      url = url.replace('http', 'ws');
    }
    // strip trailing slash
    url = url.replace(/\/$/, '');
    url += '/rtc';

    const clientInfo = getClientInfo();
    const params = createConnectionParams(token, clientInfo, opts);

    return new Promise<JoinResponse | ReconnectResponse | void>(async (resolve, reject) => {
      const abortHandler = async () => {
        await this.close();
        reject(new ConnectionError('room connection has been cancelled'));
      };

      if (abortSignal?.aborted) {
        abortHandler();
      }
      abortSignal?.addEventListener('abort', abortHandler);
      log.debug(`connecting to ${url + params}`);
      if (this.ws) {
        await this.close();
      }
      this.ws = new WebSocket(url + params);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onerror = async (ev: Event) => {
        if (!this.isConnected) {
          try {
            const resp = await fetch(`http${url.substring(2)}/validate${params}`);
            if (!resp.ok) {
              const msg = await resp.text();
              reject(new ConnectionError(msg, ConnectionErrorReason.NotAllowed, resp.status));
            } else {
              reject(
                new ConnectionError(
                  'Internal error',
                  ConnectionErrorReason.InternalError,
                  resp.status,
                ),
              );
            }
          } catch (e) {
            reject(
              new ConnectionError(
                'server was not reachable',
                ConnectionErrorReason.ServerUnreachable,
              ),
            );
          }
          return;
        }
        // other errors, handle
        this.handleWSError(ev);
      };

      this.ws.onmessage = async (ev: MessageEvent) => {
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
          let shouldProcessMessage = false;
          // handle join message only
          if (resp.message?.$case === 'join') {
            this.isConnected = true;
            abortSignal?.removeEventListener('abort', abortHandler);
            this.pingTimeoutDuration = resp.message.join.pingTimeout;
            this.pingIntervalDuration = resp.message.join.pingInterval;

            if (this.pingTimeoutDuration && this.pingTimeoutDuration > 0) {
              log.debug('ping config', {
                timeout: this.pingTimeoutDuration,
                interval: this.pingIntervalDuration,
              });
              this.startPingInterval();
            }
            resolve(resp.message.join);
          } else if (opts.reconnect) {
            // in reconnecting, any message received means signal reconnected
            this.isConnected = true;
            abortSignal?.removeEventListener('abort', abortHandler);
            this.startPingInterval();
            if (resp.message?.$case === 'reconnect') {
              resolve(resp.message?.reconnect);
            } else {
              resolve();
              shouldProcessMessage = true;
            }
          } else if (!opts.reconnect) {
            // non-reconnect case, should receive join response first
            reject(
              new ConnectionError(
                `did not receive join response, got ${resp.message?.$case} instead`,
              ),
            );
          }
          if (!shouldProcessMessage) {
            return;
          }
        }

        if (this.signalLatency) {
          await sleep(this.signalLatency);
        }
        this.handleSignalResponse(resp);
      };

      this.ws.onclose = (ev: CloseEvent) => {
        if (!this.isConnected) return;

        log.debug(`websocket connection closed: ${ev.reason}`);
        this.isConnected = false;
        if (this.onClose) {
          this.onClose(ev.reason);
        }
        this.ws = undefined;
      };
    });
  }

  async close() {
    const unlock = await this.closingLock.lock();
    try {
      this.isConnected = false;
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;

        // calling `ws.close()` only starts the closing handshake (CLOSING state), prefer to wait until state is actually CLOSED
        const closePromise = new Promise((resolve) => {
          if (this.ws) {
            this.ws.onclose = resolve;
          } else {
            resolve(true);
          }
        });

        this.ws.close();
        // 250ms grace period for ws to close gracefully
        await Promise.race([closePromise, sleep(250)]);
      }
      this.ws = undefined;
      this.clearPingInterval();
    } finally {
      unlock();
    }
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
    /** send both of ping and pingReq for compatibility to old and new server */
    this.sendRequest({
      $case: 'ping',
      ping: Date.now(),
    });
    this.sendRequest({
      $case: 'pingReq',
      pingReq: {
        timestamp: Date.now(),
        rtt: this.rtt,
      },
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
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      log.error(`cannot send signal request before connected, type: ${message?.$case}`);
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
    const msg = res.message;
    if (msg == undefined) {
      log.debug('received unsupported message');
      return;
    }
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
    } else if (msg.$case === 'pong') {
      this.resetPingTimeout();
    } else if (msg.$case === 'pongResp') {
      this.rtt = Date.now() - msg.pongResp.lastPingTimestamp;
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

  /**
   * Resets the ping timeout and starts a new timeout.
   * Call this after receiving a pong message
   */
  private resetPingTimeout() {
    this.clearPingTimeout();
    if (!this.pingTimeoutDuration) {
      log.warn('ping timeout duration not set');
      return;
    }
    this.pingTimeout = CriticalTimers.setTimeout(() => {
      log.warn(
        `ping timeout triggered. last pong received at: ${new Date(
          Date.now() - this.pingTimeoutDuration! * 1000,
        ).toUTCString()}`,
      );
      if (this.onClose) {
        this.onClose('ping timeout');
      }
    }, this.pingTimeoutDuration * 1000);
  }

  /**
   * Clears ping timeout (does not start a new timeout)
   */
  private clearPingTimeout() {
    if (this.pingTimeout) {
      CriticalTimers.clearTimeout(this.pingTimeout);
    }
  }

  private startPingInterval() {
    this.clearPingInterval();
    this.resetPingTimeout();
    if (!this.pingIntervalDuration) {
      log.warn('ping interval duration not set');
      return;
    }
    log.debug('start ping interval');
    this.pingInterval = CriticalTimers.setInterval(() => {
      this.sendPing();
    }, this.pingIntervalDuration * 1000);
  }

  private clearPingInterval() {
    log.debug('clearing ping interval');
    this.clearPingTimeout();
    if (this.pingInterval) {
      CriticalTimers.clearInterval(this.pingInterval);
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

function createConnectionParams(token: string, info: ClientInfo, opts: ConnectOpts): string {
  const params = new URLSearchParams();
  params.set('access_token', token);

  // opts
  if (opts.reconnect) {
    params.set('reconnect', '1');
    if (opts.sid) {
      params.set('sid', opts.sid);
    }
  }

  params.set('auto_subscribe', opts.autoSubscribe ? '1' : '0');

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

  if (opts.publishOnly !== undefined) {
    params.set('publish', opts.publishOnly);
  }

  if (opts.adaptiveStream) {
    params.set('adaptive_stream', '1');
  }

  if (opts.reconnectReason) {
    params.set('reconnect_reason', opts.reconnectReason.toString());
  }

  // @ts-ignore
  if (navigator.connection?.type) {
    // @ts-ignore
    params.set('network', navigator.connection.type);
  }

  return `?${params.toString()}`;
}
