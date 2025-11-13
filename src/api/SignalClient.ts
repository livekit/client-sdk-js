import { Mutex } from '@livekit/mutex';
import {
  AddTrackRequest,
  AudioTrackFeature,
  ClientInfo,
  ConnectionQualityUpdate,
  ConnectionSettings,
  DisconnectReason,
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveRequest_Action,
  MediaSectionsRequirement,
  MuteTrackRequest,
  ParticipantInfo,
  Ping,
  ReconnectReason,
  ReconnectResponse,
  RequestResponse,
  Room,
  RoomMovedResponse,
  SessionDescription,
  SignalRequest,
  SignalResponse,
  SignalTarget,
  SimulateScenario,
  SpeakerInfo,
  StreamStateUpdate,
  SubscribedQualityUpdate,
  SubscriptionPermission,
  SubscriptionPermissionUpdate,
  SubscriptionResponse,
  SyncState,
  TrackPermission,
  TrackPublishedResponse,
  TrackUnpublishedResponse,
  TrickleRequest,
  UpdateLocalAudioTrack,
  UpdateParticipantMetadata,
  UpdateSubscription,
  UpdateTrackSettings,
  UpdateVideoLayers,
  VideoLayer,
  WrappedJoinRequest,
  protoInt64,
} from '@livekit/protocol';
import { Result, ResultAsync, err, errAsync, ok, okAsync, safeTry } from 'neverthrow';
import log, { LoggerNames, getLogger } from '../logger';
import { AbortError, ConnectionError, ConnectionErrorReason, TimeoutError } from '../room/errors';
import CriticalTimers from '../room/timers';
import type { LoggerOptions } from '../room/types';
import { getClientInfo, isReactNative, sleep } from '../room/utils';
import { AsyncQueue } from '../utils/AsyncQueue';
import { type WebSocketConnection, WebSocketError, WebSocketStream } from './WebSocketStream';
import {
  createRtcUrl,
  createValidateUrl,
  parseSignalResponse,
  raceResults,
  withAbort,
  withMutex,
  withTimeout,
} from './utils';

// internal options
interface ConnectOpts extends SignalOptions {
  /** internal */
  reconnectReason?: number;
  /** internal */
  sid?: string;
}

// public options
export interface SignalOptions {
  autoSubscribe: boolean;
  adaptiveStream?: boolean;
  maxRetries: number;
  e2eeEnabled: boolean;
  websocketTimeout: number;
  singlePeerConnection: boolean;
}

type SignalMessage = SignalRequest['message'];

type SignalKind = NonNullable<SignalMessage>['case'];

const passThroughQueueSignals: Array<SignalKind> = [
  'syncState',
  'trickle',
  'offer',
  'answer',
  'simulate',
  'leave',
];

function canPassThroughQueue(req: SignalMessage): boolean {
  const canPass = passThroughQueueSignals.indexOf(req!.case) >= 0;
  log.trace('request allowed to bypass queue:', { canPass, req });
  return canPass;
}

export enum SignalConnectionState {
  CONNECTING,
  CONNECTED,
  RECONNECTING,
  DISCONNECTING,
  DISCONNECTED,
}

/** specifies how much time (in ms) we allow for the ws to close its connection gracefully before continuing */
const MAX_WS_CLOSE_TIME = 250;

/** @internal */
export class SignalClient {
  requestQueue: AsyncQueue;

  queuedRequests: Array<() => Promise<void>>;

  useJSON: boolean;

  /** signal rtt in milliseconds */
  rtt: number = 0;

  /** simulate signaling latency by delaying messages */
  signalLatency?: number;

  onClose?: (reason: string) => void;

  onAnswer?: (
    sd: RTCSessionDescriptionInit,
    offerId: number,
    midToTrackId: { [key: string]: string },
  ) => void;

  onOffer?: (
    sd: RTCSessionDescriptionInit,
    offerId: number,
    midToTrackId: { [key: string]: string },
  ) => void;

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

  onSubscriptionError?: (update: SubscriptionResponse) => void;

  onLocalTrackUnpublished?: (res: TrackUnpublishedResponse) => void;

  onTokenRefresh?: (token: string) => void;

  onLeave?: (leave: LeaveRequest) => void;

  onRequestResponse?: (response: RequestResponse) => void;

  onLocalTrackSubscribed?: (trackSid: string) => void;

  onRoomMoved?: (res: RoomMovedResponse) => void;

  onMediaSectionsRequirement?: (requirement: MediaSectionsRequirement) => void;

  connectOptions?: ConnectOpts;

  ws?: WebSocketStream;

  get currentState() {
    return this.state;
  }

  get isDisconnected() {
    return (
      this.state === SignalConnectionState.DISCONNECTING ||
      this.state === SignalConnectionState.DISCONNECTED
    );
  }

  private get isEstablishingConnection() {
    return (
      this.state === SignalConnectionState.CONNECTING ||
      this.state === SignalConnectionState.RECONNECTING
    );
  }

  private getNextRequestId() {
    this._requestId += 1;
    return this._requestId;
  }

  private options?: SignalOptions;

  private pingTimeout: ReturnType<typeof setTimeout> | undefined;

  private pingTimeoutDuration: number | undefined;

  private pingIntervalDuration: number | undefined;

  private pingInterval: ReturnType<typeof setInterval> | undefined;

  private closingLock: Mutex;

  private state: SignalConnectionState = SignalConnectionState.DISCONNECTED;

  private connectionLock: Mutex;

  private log = log;

  private loggerContextCb?: LoggerOptions['loggerContextCb'];

  private _requestId = 0;

  private streamWriter: WritableStreamDefaultWriter<ArrayBuffer | string> | undefined;

  constructor(useJSON: boolean = false, loggerOptions: LoggerOptions = {}) {
    this.log = getLogger(loggerOptions.loggerName ?? LoggerNames.Signal);
    this.loggerContextCb = loggerOptions.loggerContextCb;
    this.useJSON = useJSON;
    this.requestQueue = new AsyncQueue();
    this.queuedRequests = [];
    this.closingLock = new Mutex();
    this.connectionLock = new Mutex();
    this.state = SignalConnectionState.DISCONNECTED;
  }

  private get logContext() {
    return this.loggerContextCb?.() ?? {};
  }

  async join(url: string, token: string, opts: SignalOptions, abortSignal?: AbortSignal) {
    // during a full reconnect, we'd want to start the sequence even if currently
    // connected
    this.state = SignalConnectionState.CONNECTING;
    this.options = opts;
    return this.connect(url, token, false, opts, abortSignal);
  }

  reconnect(url: string, token: string, sid?: string, reason?: ReconnectReason) {
    if (!this.options) {
      return errAsync(
        new ConnectionError(
          'attempted to reconnect without signal options being set',
          ConnectionErrorReason.InternalError,
        ),
      );
    }
    this.state = SignalConnectionState.RECONNECTING;
    // clear ping interval and restart it once reconnected
    this.clearPingInterval();

    return this.connect(url, token, true, {
      ...this.options,
      sid,
      reconnectReason: reason,
    });
  }

  private connect<
    T extends boolean,
    U extends T extends false ? JoinResponse : ReconnectResponse | undefined,
  >(url: string, token: string, isReconnect: T, opts: ConnectOpts, abortSignal?: AbortSignal) {
    const self = this;
    const connectLabel = `SignalClient.connect [${isReconnect ? 'reconnect' : 'join'}]`;
    console.profile(connectLabel);
    console.time(connectLabel);

    return withMutex(
      safeTry<U, WebSocketError | TimeoutError | AbortError | ConnectionError>(async function* () {
        self.connectOptions = opts;

        console.time(`${connectLabel} - URL setup`);
        const clientInfo = getClientInfo();
        const params = opts.singlePeerConnection
          ? createJoinRequestConnectionParams(token, clientInfo, opts, isReconnect)
          : createConnectionParams(token, clientInfo, opts, isReconnect);
        const rtcUrl = createRtcUrl(url, params);
        const validateUrl = createValidateUrl(rtcUrl);
        console.timeEnd(`${connectLabel} - URL setup`);

        const redactedUrl = new URL(rtcUrl);
        if (redactedUrl.searchParams.has('access_token')) {
          redactedUrl.searchParams.set('access_token', '<redacted>');
        }
        self.log.debug(`connecting to ${redactedUrl}`, {
          reconnect: isReconnect,
          reconnectReason: opts.reconnectReason,
          ...self.logContext,
        });

        if (self.ws) {
          console.time(`${connectLabel} - Close existing WS`);
          await self.close(false);
          console.timeEnd(`${connectLabel} - Close existing WS`);
        }

        console.time(`${connectLabel} - Create WebSocket`);
        const ws = new WebSocketStream<ArrayBuffer>(rtcUrl);
        self.ws = ws;
        console.timeEnd(`${connectLabel} - Create WebSocket`);

        console.time(`${connectLabel} - WebSocket opened`);
        const wsConnectionResult = withTimeout(self.ws.opened, opts.websocketTimeout).mapErr(
          async (error) => {
            console.timeEnd(`${connectLabel} - WebSocket opened`);
            console.error(`[${connectLabel}] WebSocket connection failed:`, error);
            console.trace(`[${connectLabel}] WebSocket error stack trace`);

            // retrieve info about what error was causing the connection failure and enhance the returned error
            if (self.state !== SignalConnectionState.CONNECTED) {
              self.state = SignalConnectionState.DISCONNECTED;
              console.time(`${connectLabel} - Fetch error info`);
              const connectionError = await withAbort(
                withTimeout(self.fetchErrorInfo(error.message, validateUrl), 3_000),
                abortSignal,
              );
              console.timeEnd(`${connectLabel} - Fetch error info`);
              // const closeReason =
              //   'type' in error ? `${error.type}: ${error.message}` : error.message;
              const closeReason = `${error.type}: ${error.message}`;

              self.close(undefined, closeReason);
              if (connectionError.isErr()) {
                console.error(
                  `[${connectLabel}] Connection error after fetch:`,
                  connectionError.error,
                );
                return connectionError.error;
              }
            }
            return error;
          },
        );

        const wsConnection = yield* withAbort(wsConnectionResult, abortSignal).orTee((error) => {
          self.close(undefined, error.message);
        });
        console.timeEnd(`${connectLabel} - WebSocket opened`);

        console.time(`${connectLabel} - First message or close`);
        const firstMessageOrClose = raceResults([
          self.processInitialSignalMessage<T, U>(wsConnection, isReconnect),
          // Return the close promise as error if it resolves first
          ws!.closed
            .andThen((closeInfo) => {
              console.warn(`[${connectLabel}] WebSocket closed during connection:`, {
                reason: closeInfo.reason,
                code: closeInfo.closeCode,
                wasClean: closeInfo.closeCode === 1000,
              });

              if (
                closeInfo.closeCode !== 1000 &&
                // we only log the warning here if the current ws connection is still the same, we don't care about closing of older ws connections that have been replaced
                ws === self.ws
              ) {
                self.log.warn(`websocket closed`, {
                  ...self.logContext,
                  reason: closeInfo.reason,
                  code: closeInfo.closeCode,
                  wasClean: closeInfo.closeCode === 1000,
                  state: self.state,
                });
              }

              return err(
                new ConnectionError(
                  closeInfo.reason ?? 'Websocket closed during (re)connection attempt',
                  ConnectionErrorReason.InternalError,
                ),
              );
            })
            .orTee((error) => {
              console.error(`[${connectLabel}] WebSocket error during connection:`, error);
              console.trace(`[${connectLabel}] WebSocket error trace`);
              self.handleWSError(error);
            }),
        ]);

        const result = withAbort(withTimeout(firstMessageOrClose, 5_000), abortSignal).orTee(
          (error) => {
            console.error(`[${connectLabel}] Error during first message or close:`, error);
            console.trace(`[${connectLabel}] Error trace`);
            console.timeEnd(`${connectLabel} - First message or close`);
            console.timeEnd(connectLabel);
            console.profileEnd(connectLabel);

            if (error instanceof AbortError) {
              self
                .sendLeave()
                .then(() => self.close())
                .catch((e) => {
                  self.log.error(e);
                  self.close();
                });
            }
          },
        );

        console.timeEnd(`${connectLabel} - First message or close`);
        console.timeEnd(connectLabel);
        console.profileEnd(connectLabel);

        return result;
      }),
      this.connectionLock,
    );
  }

  async startReadingLoop(
    signalReader: ReadableStreamDefaultReader<string | ArrayBuffer>,
    firstMessage?: SignalResponse,
  ) {
    if (firstMessage) {
      this.handleSignalResponse(firstMessage);
    }
    while (true) {
      if (this.signalLatency) {
        await sleep(this.signalLatency);
      }
      const { done, value } = await signalReader.read();
      if (done) {
        break;
      }
      const resp = parseSignalResponse(value);
      this.handleSignalResponse(resp);
    }
  }

  /** @internal */
  resetCallbacks = () => {
    this.onAnswer = undefined;
    this.onLeave = undefined;
    this.onLocalTrackPublished = undefined;
    this.onLocalTrackUnpublished = undefined;
    this.onNegotiateRequested = undefined;
    this.onOffer = undefined;
    this.onRemoteMuteChanged = undefined;
    this.onSubscribedQualityUpdate = undefined;
    this.onTokenRefresh = undefined;
    this.onTrickle = undefined;
    this.onClose = undefined;
    this.onMediaSectionsRequirement = undefined;
  };

  async close(updateState: boolean = true, reason = 'Close method called on signal client') {
    const unlock = await this.closingLock.lock();
    try {
      this.clearPingInterval();
      if (updateState) {
        this.state = SignalConnectionState.DISCONNECTING;
      }
      if (this.ws) {
        this.ws.close({ closeCode: 1000, reason });

        // calling `ws.close()` only starts the closing handshake (CLOSING state), prefer to wait until state is actually CLOSED
        const closePromise = this.ws.closed.match(
          (closeInfo) => closeInfo,
          (error) => error,
        );
        this.ws = undefined;
        this.streamWriter = undefined;
        await Promise.race([closePromise, sleep(MAX_WS_CLOSE_TIME)]);
        this.log.info('closed websocket', { reason });
      }
    } catch (e) {
      this.log.debug('websocket error while closing', { ...this.logContext, error: e });
    } finally {
      if (updateState) {
        this.state = SignalConnectionState.DISCONNECTED;
      }
      unlock();
    }
  }

  // initial offer after joining
  sendOffer(offer: RTCSessionDescriptionInit, offerId: number) {
    this.log.debug('sending offer', { ...this.logContext, offerSdp: offer.sdp });
    this.sendRequest({
      case: 'offer',
      value: toProtoSessionDescription(offer, offerId),
    });
  }

  // answer a server-initiated offer
  sendAnswer(answer: RTCSessionDescriptionInit, offerId: number) {
    this.log.debug('sending answer', { ...this.logContext, answerSdp: answer.sdp });
    return this.sendRequest({
      case: 'answer',
      value: toProtoSessionDescription(answer, offerId),
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    this.log.debug('sending ice candidate', { ...this.logContext, candidate });
    return this.sendRequest({
      case: 'trickle',
      value: new TrickleRequest({
        candidateInit: JSON.stringify(candidate),
        target,
      }),
    });
  }

  sendMuteTrack(trackSid: string, muted: boolean) {
    return this.sendRequest({
      case: 'mute',
      value: new MuteTrackRequest({
        sid: trackSid,
        muted,
      }),
    });
  }

  sendAddTrack(req: AddTrackRequest) {
    return this.sendRequest({
      case: 'addTrack',
      value: req,
    });
  }

  async sendUpdateLocalMetadata(
    metadata: string,
    name: string,
    attributes: Record<string, string> = {},
  ) {
    const requestId = this.getNextRequestId();
    await this.sendRequest({
      case: 'updateMetadata',
      value: new UpdateParticipantMetadata({
        requestId,
        metadata,
        name,
        attributes,
      }),
    });
    return requestId;
  }

  sendUpdateTrackSettings(settings: UpdateTrackSettings) {
    this.sendRequest({
      case: 'trackSetting',
      value: settings,
    });
  }

  sendUpdateSubscription(sub: UpdateSubscription) {
    return this.sendRequest({
      case: 'subscription',
      value: sub,
    });
  }

  sendSyncState(sync: SyncState) {
    return this.sendRequest({
      case: 'syncState',
      value: sync,
    });
  }

  sendUpdateVideoLayers(trackSid: string, layers: VideoLayer[]) {
    return this.sendRequest({
      case: 'updateLayers',
      value: new UpdateVideoLayers({
        trackSid,
        layers,
      }),
    });
  }

  sendUpdateSubscriptionPermissions(allParticipants: boolean, trackPermissions: TrackPermission[]) {
    return this.sendRequest({
      case: 'subscriptionPermission',
      value: new SubscriptionPermission({
        allParticipants,
        trackPermissions,
      }),
    });
  }

  sendSimulateScenario(scenario: SimulateScenario) {
    return this.sendRequest({
      case: 'simulate',
      value: scenario,
    });
  }

  sendPing() {
    /** send both of ping and pingReq for compatibility to old and new server */
    return Promise.all([
      this.sendRequest({
        case: 'ping',
        value: protoInt64.parse(Date.now()),
      }),
      this.sendRequest({
        case: 'pingReq',
        value: new Ping({
          timestamp: protoInt64.parse(Date.now()),
          rtt: protoInt64.parse(this.rtt),
        }),
      }),
    ]);
  }

  sendUpdateLocalAudioTrack(trackSid: string, features: AudioTrackFeature[]) {
    return this.sendRequest({
      case: 'updateAudioTrack',
      value: new UpdateLocalAudioTrack({ trackSid, features }),
    });
  }

  sendLeave() {
    return this.sendRequest({
      case: 'leave',
      value: new LeaveRequest({
        reason: DisconnectReason.CLIENT_INITIATED,
        // server doesn't process this field, keeping it here to indicate the intent of a full disconnect
        action: LeaveRequest_Action.DISCONNECT,
      }),
    });
  }

  async sendRequest(message: SignalMessage, fromQueue: boolean = false) {
    // capture all requests while reconnecting and put them in a queue
    // unless the request originates from the queue, then don't enqueue again
    const canQueue = !fromQueue && !canPassThroughQueue(message);
    if (canQueue && this.state === SignalConnectionState.RECONNECTING) {
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
    if (this.isDisconnected) {
      // Skip requests if the signal layer is disconnected
      // This can happen if an event is sent in the mist of room.connect() initializing
      this.log.debug(`skipping signal request (type: ${message.case}) - SignalClient disconnected`);
      return;
    }
    if (!this.streamWriter) {
      this.log.error(
        `cannot send signal request before connected, type: ${message?.case}`,
        this.logContext,
      );
      return;
    }
    const req = new SignalRequest({ message });

    try {
      if (this.useJSON) {
        await this.streamWriter.write(req.toJsonString());
      } else {
        await this.streamWriter.write(req.toBinary());
      }
    } catch (e) {
      this.log.error('error sending signal message', { ...this.logContext, error: e });
    }
  }

  private handleSignalResponse(res: SignalResponse) {
    const msg = res.message;
    if (msg == undefined) {
      this.log.debug('received unsupported message', this.logContext);
      return;
    }

    let pingHandled = false;
    if (msg.case === 'answer') {
      const sd = fromProtoSessionDescription(msg.value);
      if (this.onAnswer) {
        this.onAnswer(sd, msg.value.id, msg.value.midToTrackId);
      }
    } else if (msg.case === 'offer') {
      const sd = fromProtoSessionDescription(msg.value);
      if (this.onOffer) {
        this.onOffer(sd, msg.value.id, msg.value.midToTrackId);
      }
    } else if (msg.case === 'trickle') {
      const candidate: RTCIceCandidateInit = JSON.parse(msg.value.candidateInit!);
      if (this.onTrickle) {
        this.onTrickle(candidate, msg.value.target);
      }
    } else if (msg.case === 'update') {
      if (this.onParticipantUpdate) {
        this.onParticipantUpdate(msg.value.participants ?? []);
      }
    } else if (msg.case === 'trackPublished') {
      if (this.onLocalTrackPublished) {
        this.onLocalTrackPublished(msg.value);
      }
    } else if (msg.case === 'speakersChanged') {
      if (this.onSpeakersChanged) {
        this.onSpeakersChanged(msg.value.speakers ?? []);
      }
    } else if (msg.case === 'leave') {
      if (this.onLeave) {
        this.onLeave(msg.value);
      }
    } else if (msg.case === 'mute') {
      if (this.onRemoteMuteChanged) {
        this.onRemoteMuteChanged(msg.value.sid, msg.value.muted);
      }
    } else if (msg.case === 'roomUpdate') {
      if (this.onRoomUpdate && msg.value.room) {
        this.onRoomUpdate(msg.value.room);
      }
    } else if (msg.case === 'connectionQuality') {
      if (this.onConnectionQuality) {
        this.onConnectionQuality(msg.value);
      }
    } else if (msg.case === 'streamStateUpdate') {
      if (this.onStreamStateUpdate) {
        this.onStreamStateUpdate(msg.value);
      }
    } else if (msg.case === 'subscribedQualityUpdate') {
      if (this.onSubscribedQualityUpdate) {
        this.onSubscribedQualityUpdate(msg.value);
      }
    } else if (msg.case === 'subscriptionPermissionUpdate') {
      if (this.onSubscriptionPermissionUpdate) {
        this.onSubscriptionPermissionUpdate(msg.value);
      }
    } else if (msg.case === 'refreshToken') {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(msg.value);
      }
    } else if (msg.case === 'trackUnpublished') {
      if (this.onLocalTrackUnpublished) {
        this.onLocalTrackUnpublished(msg.value);
      }
    } else if (msg.case === 'subscriptionResponse') {
      if (this.onSubscriptionError) {
        this.onSubscriptionError(msg.value);
      }
    } else if (msg.case === 'pong') {
    } else if (msg.case === 'pongResp') {
      this.rtt = Date.now() - Number.parseInt(msg.value.lastPingTimestamp.toString());
      this.resetPingTimeout();
      pingHandled = true;
    } else if (msg.case === 'requestResponse') {
      if (this.onRequestResponse) {
        this.onRequestResponse(msg.value);
      }
    } else if (msg.case === 'trackSubscribed') {
      if (this.onLocalTrackSubscribed) {
        this.onLocalTrackSubscribed(msg.value.trackSid);
      }
    } else if (msg.case === 'roomMoved') {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(msg.value.token);
      }
      if (this.onRoomMoved) {
        this.onRoomMoved(msg.value);
      }
    } else if (msg.case === 'mediaSectionsRequirement') {
      if (this.onMediaSectionsRequirement) {
        this.onMediaSectionsRequirement(msg.value);
      }
    } else {
      this.log.debug('unsupported message', { ...this.logContext, msgCase: msg.case });
    }

    if (!pingHandled) {
      this.resetPingTimeout();
    }
  }

  setReconnected() {
    while (this.queuedRequests.length > 0) {
      const req = this.queuedRequests.shift();
      if (req) {
        this.requestQueue.run(req);
      }
    }
  }

  private async handleOnClose(reason: string) {
    if (this.state === SignalConnectionState.DISCONNECTED) return;
    const onCloseCallback = this.onClose;
    await this.close(undefined, reason);
    this.log.debug(`websocket connection closed: ${reason}`, { ...this.logContext, reason });
    if (onCloseCallback) {
      onCloseCallback(reason);
    }
  }

  private handleWSError(error: unknown) {
    this.log.error('websocket error', { ...this.logContext, error });
  }

  /**
   * Resets the ping timeout and starts a new timeout.
   * Call this after receiving a pong message
   */
  private resetPingTimeout() {
    this.clearPingTimeout();
    if (!this.pingTimeoutDuration) {
      this.log.warn('ping timeout duration not set', this.logContext);
      return;
    }
    this.pingTimeout = CriticalTimers.setTimeout(() => {
      this.log.warn(
        `ping timeout triggered. last pong received at: ${new Date(
          Date.now() - this.pingTimeoutDuration! * 1000,
        ).toUTCString()}`,
        this.logContext,
      );
      this.handleOnClose('ping timeout');
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
      this.log.warn('ping interval duration not set', this.logContext);
      return;
    }
    this.log.debug('start ping interval', this.logContext);
    this.pingInterval = CriticalTimers.setInterval(() => {
      this.sendPing();
    }, this.pingIntervalDuration * 1000);
  }

  private clearPingInterval() {
    this.log.debug('clearing ping interval', this.logContext);
    this.clearPingTimeout();
    if (this.pingInterval) {
      CriticalTimers.clearInterval(this.pingInterval);
    }
  }

  /**
   * Handles the successful connection to the signal server
   * @param connection The WebSocket connection
   * @param timeoutHandle The timeout handle to clear
   * @param firstMessage Optional first message to process
   * @internal
   */
  private handleSignalConnected(connection: WebSocketConnection, firstMessage?: SignalResponse) {
    this.state = SignalConnectionState.CONNECTED;
    this.startPingInterval();
    this.startReadingLoop(connection.readable.getReader(), firstMessage);
  }

  private processInitialSignalMessage<
    T extends boolean,
    U extends T extends false ? JoinResponse : ReconnectResponse | undefined,
  >(connection: WebSocketConnection, isReconnect: T): ResultAsync<U, ConnectionError> {
    const self = this;
    const processLabel = `SignalClient.processInitialSignalMessage [${isReconnect ? 'reconnect' : 'join'}]`;
    console.time(processLabel);

    // TODO: This should be more granular here than ConnectionError
    return safeTry<U, ConnectionError>(async function* () {
      console.time(`${processLabel} - Setup readers/writers`);
      const signalReader = connection.readable.getReader();
      self.streamWriter = connection.writable.getWriter();
      console.timeEnd(`${processLabel} - Setup readers/writers`);

      console.time(`${processLabel} - Read first message`);
      const firstMessage = await signalReader.read().finally(() => signalReader.releaseLock());
      console.timeEnd(`${processLabel} - Read first message`);

      if (!firstMessage.value) {
        console.error(`[${processLabel}] No message received as first message`);
        console.trace(`[${processLabel}] No first message trace`);
        console.timeEnd(processLabel);
        return err(
          new ConnectionError(
            'no message received as first message',
            ConnectionErrorReason.InternalError,
          ),
        );
      }

      console.time(`${processLabel} - Parse first message`);
      const firstSignalResponse = parseSignalResponse(firstMessage.value);
      console.log(`[${processLabel}] First message type:`, firstSignalResponse.message?.case);
      console.timeEnd(`${processLabel} - Parse first message`);

      // Validate the first message
      console.time(`${processLabel} - Validate first message`);
      const validation = yield* self.validateFirstMessage(firstSignalResponse, isReconnect);
      console.timeEnd(`${processLabel} - Validate first message`);

      // Handle join response - set up ping configuration
      if (firstSignalResponse.message?.case === 'join') {
        self.pingTimeoutDuration = firstSignalResponse.message.value.pingTimeout;
        self.pingIntervalDuration = firstSignalResponse.message.value.pingInterval;
        if (self.pingTimeoutDuration && self.pingTimeoutDuration > 0) {
          console.log(`[${processLabel}] Ping config:`, {
            timeout: self.pingTimeoutDuration,
            interval: self.pingIntervalDuration,
          });
          self.log.debug('ping config', {
            ...self.logContext,
            timeout: self.pingTimeoutDuration,
            interval: self.pingIntervalDuration,
          });
        }
      }

      // Handle successful connection
      console.time(`${processLabel} - Handle signal connected`);
      const firstMessageToProcess = validation.shouldProcessFirstMessage
        ? firstSignalResponse
        : undefined;
      self.handleSignalConnected(connection, firstMessageToProcess);
      console.timeEnd(`${processLabel} - Handle signal connected`);
      console.timeEnd(processLabel);

      return okAsync(validation.response as U);
    });
  }

  /**
   * Validates the first message received from the signal server
   * @param firstSignalResponse The first signal response received
   * @param isReconnect Whether this is a reconnection attempt
   * @returns Validation result with response or error
   * @internal
   */
  private validateFirstMessage(
    firstSignalResponse: SignalResponse,
    isReconnect: boolean,
  ): Result<
    ValidationType,
    // TODO, this should probably not be a ConnectionError?
    ConnectionError
  > {
    console.log('[SignalClient.validateFirstMessage]', {
      messageCase: firstSignalResponse.message?.case,
      isReconnect,
      state: this.state,
    });

    if (isReconnect === false && firstSignalResponse.message?.case === 'join') {
      console.log('[SignalClient.validateFirstMessage] Valid join response');
      return ok({
        response: firstSignalResponse.message.value,
        shouldProcessFirstMessage: false,
      });
    } else if (
      isReconnect === true &&
      this.state === SignalConnectionState.RECONNECTING &&
      firstSignalResponse.message?.case !== 'leave'
    ) {
      if (firstSignalResponse.message?.case === 'reconnect') {
        console.log('[SignalClient.validateFirstMessage] Valid reconnect response');
        return ok({
          response: firstSignalResponse.message.value,
          shouldProcessFirstMessage: false,
        });
      } else {
        // in reconnecting, any message received means signal reconnected and we still need to process it
        console.log('[SignalClient.validateFirstMessage] Reconnected without reconnect response');
        this.log.debug(
          'declaring signal reconnected without reconnect response received',
          this.logContext,
        );
        return ok({
          response: undefined,
          shouldProcessFirstMessage: true,
        });
      }
    } else if (this.isEstablishingConnection && firstSignalResponse.message?.case === 'leave') {
      console.error(
        '[SignalClient.validateFirstMessage] Received leave request during connection',
        {
          leaveReason: firstSignalResponse.message.value.reason,
        },
      );
      console.trace('[SignalClient.validateFirstMessage] Leave request stack trace');
      return err(
        new ConnectionError(
          'Received leave request while trying to (re)connect',
          ConnectionErrorReason.LeaveRequest,
          undefined,
          firstSignalResponse.message.value.reason,
        ),
      );
    } else if (!isReconnect) {
      // non-reconnect case, should receive join response first
      console.error(
        '[SignalClient.validateFirstMessage] Expected join, got:',
        firstSignalResponse.message?.case,
      );
      console.trace('[SignalClient.validateFirstMessage] Unexpected message trace');
      return err(
        new ConnectionError(
          `did not receive join response, got ${firstSignalResponse.message?.case} instead`,
          ConnectionErrorReason.InternalError,
        ),
      );
    }

    console.error('[SignalClient.validateFirstMessage] Unexpected first message');
    console.trace('[SignalClient.validateFirstMessage] Unexpected message trace');
    return err(
      new ConnectionError('Unexpected first message', ConnectionErrorReason.InternalError),
    );
  }

  /**
   * Handles WebSocket connection errors by validating with the server
   * @param reason The error that occurred
   * @param validateUrl The URL to validate the connection with
   * @returns A ConnectionError with appropriate reason and status
   * @internal
   */
  private async fetchErrorInfo(
    reason: unknown,
    validateUrl: string,
  ): Promise<Result<never, ConnectionError>> {
    console.log('[SignalClient.fetchErrorInfo] Fetching error info:', { reason, validateUrl });
    try {
      const resp = await fetch(validateUrl);
      console.log('[SignalClient.fetchErrorInfo] Validation response:', {
        status: resp.status,
        statusText: resp.statusText,
      });

      if (resp.status.toFixed(0).startsWith('4')) {
        const msg = await resp.text();
        console.error('[SignalClient.fetchErrorInfo] 4xx error:', msg);
        return err(new ConnectionError(msg, ConnectionErrorReason.NotAllowed, resp.status));
      } else if (reason instanceof ConnectionError) {
        console.error('[SignalClient.fetchErrorInfo] ConnectionError:', reason);
        return err(reason);
      } else {
        console.error('[SignalClient.fetchErrorInfo] Unknown WebSocket error:', reason);
        return err(
          new ConnectionError(
            `Encountered unknown websocket error during connection: ${reason}`,
            ConnectionErrorReason.InternalError,
            resp.status,
          ),
        );
      }
    } catch (e) {
      console.error('[SignalClient.fetchErrorInfo] Fetch failed:', e);
      console.trace('[SignalClient.fetchErrorInfo] Fetch error trace');
      return err(
        e instanceof ConnectionError
          ? e
          : new ConnectionError(
              e instanceof Error ? e.message : 'server was not reachable',
              ConnectionErrorReason.ServerUnreachable,
            ),
      );
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
  id?: number,
): SessionDescription {
  const sd = new SessionDescription({
    sdp: rsd.sdp!,
    type: rsd.type!,
    id,
  });
  return sd;
}

function createConnectionParams(
  token: string,
  info: ClientInfo,
  opts: ConnectOpts,
  isReconnect: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('access_token', token);

  // opts
  if (isReconnect) {
    params.set('reconnect', '1');
    if (opts.sid) {
      params.set('sid', opts.sid);
    }
  }

  params.set('auto_subscribe', opts.autoSubscribe ? '1' : '0');

  // ClientInfo
  params.set('sdk', isReactNative() ? 'reactnative' : 'js');
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

  return params;
}

function createJoinRequestConnectionParams(
  token: string,
  info: ClientInfo,
  opts: ConnectOpts,
  isReconnect: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('access_token', token);

  const joinRequest = new JoinRequest({
    clientInfo: info,
    connectionSettings: new ConnectionSettings({
      autoSubscribe: !!opts.autoSubscribe,
      adaptiveStream: !!opts.adaptiveStream,
    }),
    reconnect: isReconnect,
    participantSid: opts.sid ? opts.sid : undefined,
  });
  if (opts.reconnectReason) {
    joinRequest.reconnectReason = opts.reconnectReason;
  }
  const wrappedJoinRequest = new WrappedJoinRequest({
    joinRequest: joinRequest.toBinary(),
  });
  params.set('join_request', btoa(new TextDecoder('utf-8').decode(wrappedJoinRequest.toBinary())));

  return params;
}

export type ValidationType =
  | { response: JoinResponse; shouldProcessFirstMessage: false }
  | { response: ReconnectResponse; shouldProcessFirstMessage: false }
  | { response: undefined; shouldProcessFirstMessage: true };
