import { Mutex } from '@livekit/mutex';
import {
  AddTrackRequest,
  AudioTrackFeature,
  ClientInfo,
  ClientInfo_Capability,
  ConnectionQualityUpdate,
  ConnectionSettings,
  DataTrackSubscriberHandles,
  DisconnectReason,
  Encryption_Type,
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveRequest_Action,
  MediaSectionsRequirement,
  MuteTrackRequest,
  ParticipantInfo,
  Ping,
  PublishDataTrackRequest,
  PublishDataTrackResponse,
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
  UnpublishDataTrackRequest,
  UnpublishDataTrackResponse,
  UpdateDataSubscription,
  UpdateDataSubscription_Update,
  UpdateLocalAudioTrack,
  UpdateParticipantMetadata,
  UpdateSubscription,
  UpdateTrackSettings,
  UpdateVideoLayers,
  VideoLayer,
  WrappedJoinRequest,
  WrappedJoinRequest_Compression,
  protoInt64,
} from '@livekit/protocol';
import log, { LoggerNames, getLogger } from '../logger';
import type { DataTrackHandle } from '../room/data-track/handle';
import { type DataTrackSid } from '../room/data-track/types';
import { ConnectionError } from '../room/errors';
import CriticalTimers from '../room/timers';
import type { LoggerOptions } from '../room/types';
import { getClientInfo, isCompressionStreamSupported, isReactNative, sleep } from '../room/utils';
import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';
import { AsyncQueue } from '../utils/AsyncQueue';
import { SignalConnectionRunner } from './SignalConnectionRunner';
import {
  type ConnectionFailure,
  type MessageKind,
  SignalConnectionStatus,
  type SignalEffect,
  routeMessage,
} from './SignalConnectionState';
import { type WebSocketConnection, WebSocketStream } from './WebSocketStream';
import {
  createRtcUrl,
  createValidateUrl,
  getAbortReasonAsString,
  parseSignalResponse,
} from './utils';

// internal options
interface ConnectOpts extends SignalOptions {
  /** internal */
  reconnect?: boolean;
  /** internal */
  reconnectReason?: number;
  /** internal */
  sid?: string;
}

// public options
export interface SignalOptions {
  autoSubscribe: boolean;
  adaptiveStream?: boolean;
  clientInfoCapabilities?: ClientInfo_Capability[];
  maxRetries: number;
  e2eeEnabled: boolean;
  websocketTimeout: number;
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

/**
 * The lifecycle machine's 7 statuses collapsed onto this module's public 5-value
 * enum. `suspended` is a recoverable pause the public enum has never modelled,
 * so — like `new` and `closed` — it reads as DISCONNECTED to callers.
 */
function toPublicState(status: SignalConnectionStatus): SignalConnectionState {
  switch (status) {
    case SignalConnectionStatus.CONNECTING:
      return SignalConnectionState.CONNECTING;
    case SignalConnectionStatus.CONNECTED:
      return SignalConnectionState.CONNECTED;
    case SignalConnectionStatus.RECONNECTING:
      return SignalConnectionState.RECONNECTING;
    case SignalConnectionStatus.DISCONNECTING:
      return SignalConnectionState.DISCONNECTING;
    default:
      return SignalConnectionState.DISCONNECTED;
  }
}

/** specifies how much time (in ms) we allow for the ws to close its connection gracefully before continuing */
const MAX_WS_CLOSE_TIME = 250;

/**
 * How long (in ms) to wait for the first message after the WebSocket upgrade.
 */
const JOIN_RESPONSE_TIMEOUT = 5_000;

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

  onPublishDataTrackResponse?: (event: PublishDataTrackResponse) => void;

  onUnPublishDataTrackResponse?: (event: UnpublishDataTrackResponse) => void;

  onDataTrackSubscriberHandles?: (event: DataTrackSubscriberHandles) => void;

  onJoined?: (event: JoinResponse) => void;

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

  /**
   * Connection lifecycle machine. The only writer of the connection status:
   * every status change goes through an event, and the machine rejects events
   * that aren't legal in the current status instead of silently accepting them.
   * @internal
   */
  machine: SignalConnectionRunner;

  private get state(): SignalConnectionState {
    return toPublicState(this.machine.status);
  }

  private connectionLock: Mutex;

  private log = log;

  private loggerContextCb?: LoggerOptions['loggerContextCb'];

  private _requestId = 0;

  private streamWriter: WritableStreamDefaultWriter<ArrayBuffer | string> | undefined;

  private useV0SignalPath = false;

  constructor(useJSON: boolean = false, loggerOptions: LoggerOptions = {}) {
    this.loggerContextCb = loggerOptions.loggerContextCb;
    this.log = getLogger(loggerOptions.loggerName ?? LoggerNames.Signal, () => this.logContext);
    this.useJSON = useJSON;
    this.requestQueue = new AsyncQueue();
    this.queuedRequests = [];
    this.closingLock = new Mutex();
    this.connectionLock = new Mutex();
    this.machine = this.createMachine();
  }

  /**
   * Close reason the next close_transport command will use. The machine decides
   * *when* to close; the executor supplies the parameters — which is also why a
   * reconnect's open_transport carries no url.
   */
  private pendingCloseReason?: string;

  private transportAuthorised = false;

  /**
   * The lifecycle has authorised a transport. Consumed by `connect()`, which
   * opens the socket once it has built the endpoint.
   *
   * The command and the opening are separated because the endpoint is not known
   * when the transition happens: `join()`/`reconnect()` must move the status
   * synchronously (callers read `currentState` straight after the call), while
   * building the url is async. What the effect guarantees is that a socket is
   * only ever created for an accepted transition — `connect()` used to open one
   * regardless of whether the event was legal in the current status.
   */
  private openTransport() {
    this.transportAuthorised = true;
  }

  /**
   * Ask the transport to close. Only starts the handshake; whoever initiated the
   * close awaits `ws.closed` (bounded by MAX_WS_CLOSE_TIME).
   */
  private closeTransport() {
    this.ws?.close({
      closeCode: 1000,
      reason: this.pendingCloseReason ?? 'Close method called on signal client',
    });
  }

  private createMachine(): SignalConnectionRunner {
    return new SignalConnectionRunner((effects) => this.executeEffects(effects), {
      onStatusChanged: (status, previous) =>
        this.log.debug(`signal lifecycle: ${previous} -> ${status}`, this.logContext),
      onIgnored: (event, status) =>
        this.log.debug(`ignoring ${event.type} while ${status}`, this.logContext),
    });
  }

  /**
   * Performs the commands the machine emits for a transition.
   *
   * The transport, the ping timer, the message buffer and the disconnect
   * notification are all driven from here, so each is commanded by a
   * transition rather than by whoever happened to call a method.
   * `reconnect_completed` and `leave_received` remain unhandled: RTCEngine and
   * `handleSignalResponse` already surface those, and duplicating them here
   * would notify twice. The machine still emits them so the effect vocabulary
   * matches the spec.
   */
  private executeEffects(effects: SignalEffect[]) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'start_ping':
          this.startPingInterval();
          break;
        case 'stop_ping':
          this.clearPingInterval();
          break;
        case 'clear_queue':
          // Reaching the terminal status drops whatever is still buffered.
          this.queuedRequests = [];
          break;
        case 'open_transport':
          this.openTransport();
          break;
        case 'close_transport':
          this.closeTransport();
          break;
        case 'connection_lost': {
          // The machine emits this only for a connection that had reached
          // CONNECTED, which is exactly when an unexpected disconnect should be
          // reported. The phase check that used to guard this call is now the
          // table's job.
          const failure = effect.params?.failure as ConnectionFailure | undefined;
          this.handleOnClose(failure?.message ?? 'connection lost');
          break;
        }
        default:
          break;
      }
    }
  }

  private get logContext() {
    return this.loggerContextCb?.() ?? {};
  }

  async join(
    url: string,
    token: string,
    opts: SignalOptions,
    abortSignal?: AbortSignal,
    useV0Path: boolean = false,
    publisherOffer?: SessionDescription,
  ): Promise<JoinResponse> {
    // A join begins a new connection lifecycle even if one is already running:
    // a full reconnect replaces the previous connection rather than resuming it,
    // so the machine is recreated rather than driven back to the start. Sent here
    // rather than in connect() so the status moves before this method returns.
    this.machine = this.createMachine();
    this.machine.send({ type: 'connect', url });
    this.options = opts;
    const res = await this.connect(url, token, opts, abortSignal, useV0Path, publisherOffer);
    return res as JoinResponse;
  }

  async reconnect(
    url: string,
    token: string,
    sid?: string,
    reason?: ReconnectReason,
  ): Promise<ReconnectResponse | undefined> {
    if (!this.options) {
      this.log.warn('attempted to reconnect without signal options being set, ignoring');
      return;
    }
    // Moves the status before this method returns, as join() does. Leaving
    // `connected` disarms the ping as an exit action, so nothing to clear here.
    this.machine.send({ type: 'start_reconnect' });

    const res = (await this.connect(
      url,
      token,
      {
        ...this.options,
        reconnect: true,
        sid,
        reconnectReason: reason,
      },
      undefined,
      this.useV0SignalPath,
    )) as ReconnectResponse | undefined;
    return res;
  }

  private async connect(
    url: string,
    token: string,
    opts: ConnectOpts,
    abortSignal?: AbortSignal,
    /** setting this to true results in dual peer connection mode being used */
    useV0Path: boolean = false,
    publisherOffer?: SessionDescription,
  ): Promise<JoinResponse | ReconnectResponse | undefined> {
    const unlock = await this.connectionLock.lock();

    this.connectOptions = opts;
    this.useV0SignalPath = useV0Path;

    const clientInfo = getClientInfo(opts.clientInfoCapabilities);
    const params = useV0Path
      ? createConnectionParams(token, clientInfo, opts)
      : await createJoinRequestConnectionParams(token, clientInfo, opts, publisherOffer);
    const rtcUrl = createRtcUrl(url, params, useV0Path).toString();
    const validateUrl = createValidateUrl(rtcUrl).toString();

    return new Promise<JoinResponse | ReconnectResponse | undefined>(async (resolve, reject) => {
      try {
        let alreadyAborted = false;
        const abortHandler = async (eventOrError: Event | Error) => {
          if (alreadyAborted) {
            return;
          }
          alreadyAborted = true;
          // An Event comes from the caller's AbortSignal; an Error is raised by
          // us (e.g. the connect timeout below).
          const isCallerAbort = eventOrError instanceof Event;
          const target = isCallerAbort ? eventOrError.currentTarget : eventOrError;
          const reason = getAbortReasonAsString(target, 'Abort handler called');
          // send leave if we have an active stream writer (connection is open)
          if (this.streamWriter && !this.isDisconnected) {
            this.sendLeave()
              .then(() => this.close(reason))
              .catch((e) => {
                this.log.error(e);
                this.close();
              });
          } else {
            this.close();
          }
          cleanupAbortHandlers();
          // Only the caller aborting is a cancellation. An error we raised
          // ourselves keeps its own reason, so callers can tell "gave up
          // waiting" from "caller cancelled" — they retry differently.
          reject(
            !isCallerAbort && eventOrError instanceof ConnectionError
              ? eventOrError
              : ConnectionError.cancelled(reason),
          );
        };

        abortSignal?.addEventListener('abort', abortHandler);

        const cleanupAbortHandlers = () => {
          clearTimeout(wsTimeout);
          abortSignal?.removeEventListener('abort', abortHandler);
        };

        const wsTimeout = setTimeout(() => {
          abortHandler(ConnectionError.timeout('room connection has timed out (signal)'));
        }, opts.websocketTimeout);

        const handleSignalConnected = (
          connection: WebSocketConnection,
          firstMessage?: SignalResponse,
        ) => {
          this.handleSignalConnected(connection, wsTimeout, firstMessage);
        };

        const redactedUrl = new URL(rtcUrl);
        if (redactedUrl.searchParams.has('access_token')) {
          redactedUrl.searchParams.set('access_token', '<redacted>');
        }

        if (this.ws) {
          const startClose = performance.now();
          await this.close(false);
          this.log.debug(`closed previous ws connection in ${performance.now() - startClose}ms`);
        }

        this.log.info(`signal connecting to ${redactedUrl}`, {
          reconnect: opts.reconnect,
          reconnectReason: opts.reconnectReason,
        });

        // Open only what the lifecycle authorised: if the machine refused the
        // event that begins an attempt, no open_transport was emitted and there
        // is nothing to connect.
        if (!this.transportAuthorised) {
          reject(
            ConnectionError.internal(
              `cannot ${opts.reconnect ? 'reconnect' : 'connect'} while ${this.machine.status}`,
            ),
          );
          return;
        }
        this.transportAuthorised = false;
        this.ws = new WebSocketStream<ArrayBuffer>(rtcUrl);

        try {
          this.ws.closed
            .then((closeInfo) => {
              if (this.isEstablishingConnection) {
                reject(
                  ConnectionError.internal(
                    `Websocket got closed during a (re)connection attempt: ${closeInfo.reason}`,
                  ),
                );
              }
              if (closeInfo.closeCode !== 1000) {
                this.log.warn(`websocket closed`, {
                  reason: closeInfo.reason,
                  code: closeInfo.closeCode,
                  wasClean: closeInfo.closeCode === 1000,
                  state: this.state,
                });
                // Report the loss and let the table decide what it means: from
                // CONNECTED it suspends and emits connection_lost (which drives
                // onClose); in any other phase the pending attempt's own
                // rejection is the outcome and no notification is emitted.
                this.machine.send({
                  type: 'transport_closed',
                  reason: closeInfo.reason ?? '',
                });
              }
              return;
            })
            .catch((reason) => {
              if (this.isEstablishingConnection) {
                reject(
                  ConnectionError.internal(
                    `Websocket error during a (re)connection attempt: ${reason}`,
                  ),
                );
              }
            });
          const connection = await this.ws.opened.catch(async (reason: unknown) => {
            if (this.state !== SignalConnectionState.CONNECTED) {
              clearTimeout(wsTimeout);
              // Leave the establishing phase synchronously, before awaiting
              // classification. While the machine still reports connecting or
              // reconnecting, the transport-closed handler below treats this as
              // an in-flight attempt and rejects it with its own generic error,
              // which would win the race against the classified one.
              this.machine.send({ type: 'attempt_failed' });
              const error = await this.handleConnectionError(reason, validateUrl);
              reject(error);
              return;
            }
            // other errors, handle
            this.handleWSError(reason);
            reject(reason);
            return;
          });
          clearTimeout(wsTimeout);
          if (!connection) {
            return;
          }
          const signalReader = connection.readable.getReader();
          this.streamWriter = connection.writable.getWriter();

          // wsTimeout only guarded the upgrade; guard the first-message read with
          // its own timeout so a silent server can't hang join() forever.
          let firstMessage: ReadableStreamReadResult<string | ArrayBuffer>;
          let firstMessageTimeout: ReturnType<typeof setTimeout> | undefined;
          try {
            firstMessage = await Promise.race([
              signalReader.read(),
              new Promise<never>((_, rejectRead) => {
                firstMessageTimeout = setTimeout(() => {
                  rejectRead(
                    ConnectionError.timeout(
                      'signal connection timed out while waiting for the first message',
                    ),
                  );
                }, JOIN_RESPONSE_TIMEOUT);
              }),
            ]);
          } catch (e) {
            // No first message in time: release the reader and tear down the ws
            // so we surface the timeout instead of leaking an open connection.
            signalReader.releaseLock();
            // The table routes this by phase: terminal for an initial connect,
            // recoverable (suspended) for a reconnect.
            this.machine.send({ type: 'attempt_timed_out' });
            reject(e);
            // The machine has already recorded why the attempt ended, so tear
            // the transport down without emitting a further lifecycle event.
            this.close(false);
            return;
          } finally {
            clearTimeout(firstMessageTimeout);
          }
          signalReader.releaseLock();
          if (!firstMessage.value) {
            throw ConnectionError.internal('no message received as first message');
          }

          const firstSignalResponse = parseSignalResponse(firstMessage.value);

          // Validate the first message
          const validation = this.validateFirstMessage(
            firstSignalResponse,
            opts.reconnect ?? false,
          );

          if (!validation.isValid) {
            reject(validation.error);
            return;
          }

          // Handle join response
          if (firstSignalResponse.message?.case === 'join') {
            // Set up ping configuration
            this.pingTimeoutDuration = firstSignalResponse.message.value.pingTimeout;
            this.pingIntervalDuration = firstSignalResponse.message.value.pingInterval;

            if (this.pingTimeoutDuration && this.pingTimeoutDuration > 0) {
              this.log.debug('ping config', {
                timeout: this.pingTimeoutDuration,
                interval: this.pingIntervalDuration,
              });
            }

            if (this.onJoined) {
              this.onJoined(firstSignalResponse.message.value);
            }
          }

          // Handle successful connection
          const firstMessageToProcess = validation.shouldProcessFirstMessage
            ? firstSignalResponse
            : undefined;
          handleSignalConnected(connection, firstMessageToProcess);
          resolve(validation.response);
        } catch (e) {
          reject(e);
        } finally {
          cleanupAbortHandlers();
        }
      } finally {
        unlock();
      }
    });
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
    if (
      [SignalConnectionState.DISCONNECTING || SignalConnectionState.DISCONNECTED].includes(
        this.state,
      )
    ) {
      this.log.debug(`ignoring signal close as it's already in disconnecting state`);
      return;
    }
    const unlock = await this.closingLock.lock();
    try {
      if (updateState) {
        // Only a deliberate close is a lifecycle event. From `connected` this
        // enters `disconnecting` (and disarms the ping as an exit action); from
        // the other statuses there is no transport handshake to await, so it
        // terminates directly. The close_transport effect asks the socket to
        // close — and the table omits it where there is no transport left.
        this.pendingCloseReason = reason;
        this.machine.send({ type: 'close' });
      } else {
        // A teardown that must preserve the status — replacing the transport for
        // a reconnect — leaves the machine untouched. Conflating the two is what
        // makes a reconnect appear to close itself. With no lifecycle event there
        // is no effect either, so close the socket directly.
        this.clearPingInterval();
        this.ws?.close({ closeCode: 1000, reason });
      }
      if (this.ws) {
        // ws.close() only starts the closing handshake (CLOSING state), so wait
        // until the state is actually CLOSED.
        const closePromise = this.ws.closed;
        this.ws = undefined;
        this.streamWriter = undefined;
        await Promise.race([closePromise, sleep(MAX_WS_CLOSE_TIME)]);
      }
    } catch (e) {
      this.log.debug('websocket error while closing', { error: e });
    } finally {
      if (updateState && this.machine.status === SignalConnectionStatus.DISCONNECTING) {
        // The graceful close has run its course (or timed out waiting for the
        // transport to confirm), so complete it rather than staying here.
        this.machine.send({ type: 'close_completed' });
      }
      unlock();
    }
  }

  // initial offer after joining
  sendOffer(offer: RTCSessionDescriptionInit, offerId: number) {
    this.log.debug('sending offer', { offerSdp: offer.sdp });
    this.sendRequest({
      case: 'offer',
      value: toProtoSessionDescription(offer, offerId),
    });
  }

  // answer a server-initiated offer
  sendAnswer(answer: RTCSessionDescriptionInit, offerId: number) {
    this.log.debug('sending answer', { answerSdp: answer.sdp });
    return this.sendRequest({
      case: 'answer',
      value: toProtoSessionDescription(answer, offerId),
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    this.log.debug('sending ice candidate', { candidate });
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

  sendPublishDataTrackRequest(handle: DataTrackHandle, name: string, usesE2ee: boolean) {
    return this.sendRequest({
      case: 'publishDataTrackRequest',
      value: new PublishDataTrackRequest({
        pubHandle: handle,
        name: name,
        encryption: usesE2ee ? Encryption_Type.GCM : Encryption_Type.NONE,
      }),
    });
  }

  sendUnPublishDataTrackRequest(handle: DataTrackHandle) {
    return this.sendRequest({
      case: 'unpublishDataTrackRequest',
      value: new UnpublishDataTrackRequest({ pubHandle: handle }),
    });
  }

  sendUpdateDataSubscription(sid: DataTrackSid, subscribe: boolean) {
    return this.sendRequest({
      case: 'updateDataSubscription',
      value: new UpdateDataSubscription({
        // FIXME: consider refactoring to allow caller to pass an array of events through
        updates: [
          new UpdateDataSubscription_Update({
            trackSid: sid,
            subscribe,
          }),
        ],
      }),
    });
  }

  private async sendRequest(message: SignalMessage, fromQueue: boolean = false) {
    // A request coming back out of the buffer is being drained: it has already
    // been routed once and must dispatch, or it would be re-buffered forever.
    if (!fromQueue) {
      const kind: MessageKind = canPassThroughQueue(message) ? 'passthrough' : 'queueable';
      // The buffer is queuedRequests; requestQueue only serializes in-flight
      // writes and says nothing about ordering against buffered messages.
      const route = routeMessage(this.machine.status, kind, this.queuedRequests.length === 0);
      if (route === 'buffer') {
        this.queuedRequests.push(async () => {
          await this.sendRequest(message, true);
        });
        return;
      }
      if (route !== 'dispatch') {
        // drop (passthrough with no live transport) or reject (a status that
        // structurally cannot serve the message, e.g. mid room.connect()).
        this.log.debug(
          `${route}ing signal request (type: ${message.case}) while ${this.machine.status}`,
        );
        return;
      }
    }
    // make sure previously queued requests are being sent first
    if (!fromQueue) {
      await this.requestQueue.flush();
    }
    if (this.signalLatency) {
      await sleep(this.signalLatency);
    }
    if (!this.streamWriter) {
      this.log.error(`cannot send signal request before connected, type: ${message?.case}`);
      return;
    }
    const req = new SignalRequest({ message });

    try {
      if (this.useJSON) {
        await this.streamWriter.write(req.toJsonString());
      } else {
        await this.streamWriter.write((req.toBinary() as NonSharedUint8Array).buffer);
      }
    } catch (e) {
      this.log.error('error sending signal message', { error: e });
    }
  }

  private handleSignalResponse(res: SignalResponse) {
    const msg = res.message;
    if (msg == undefined) {
      this.log.debug('received unsupported message');
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
    } else if (msg.case === 'publishDataTrackResponse') {
      if (this.onPublishDataTrackResponse) {
        this.onPublishDataTrackResponse(msg.value);
      }
    } else if (msg.case === 'unpublishDataTrackResponse') {
      if (this.onUnPublishDataTrackResponse) {
        this.onUnPublishDataTrackResponse(msg.value);
      }
    } else if (msg.case === 'dataTrackSubscriberHandles') {
      if (this.onDataTrackSubscriberHandles) {
        this.onDataTrackSubscriberHandles(msg.value);
      }
    } else {
      this.log.debug('unsupported message', { msgCase: msg.case });
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
    // Suppress a duplicate notification once the connection is already terminal.
    // Deliberately not a check on the public state: `suspended` also reads as
    // DISCONNECTED, and that is exactly the status an unexpected close leaves
    // behind — the case this method exists to report.
    if (this.machine.status === SignalConnectionStatus.CLOSED) return;
    const onCloseCallback = this.onClose;
    await this.close(undefined, reason);
    this.log.info(`websocket connection closed: ${reason}`, { reason });
    if (onCloseCallback) {
      onCloseCallback(reason);
    }
  }

  private handleWSError(error: unknown) {
    this.log.error('websocket error', { error });
  }

  /**
   * Resets the ping timeout and starts a new timeout.
   * Call this after receiving a pong message
   */
  private resetPingTimeout() {
    this.clearPingTimeout();
    if (!this.pingTimeoutDuration) {
      this.log.warn('ping timeout duration not set');
      return;
    }
    this.pingTimeout = CriticalTimers.setTimeout(() => {
      this.log.warn(
        `ping timeout triggered. last pong received at: ${new Date(
          Date.now() - this.pingTimeoutDuration! * 1000,
        ).toUTCString()}`,
      );
      // connection_lost, emitted by the transition out of CONNECTED, drives the
      // onClose notification.
      this.machine.send({ type: 'ping_timeout' });
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
      this.log.warn('ping interval duration not set');
      return;
    }
    this.log.debug('start ping interval');
    this.pingInterval = CriticalTimers.setInterval(() => {
      this.sendPing();
    }, this.pingIntervalDuration * 1000);
  }

  private clearPingInterval() {
    this.log.debug('clearing ping interval');
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
  private handleSignalConnected(
    connection: WebSocketConnection,
    timeoutHandle: ReturnType<typeof setTimeout>,
    firstMessage?: SignalResponse,
  ) {
    const pingConfig = {
      intervalS: this.pingIntervalDuration ?? 0,
      timeoutS: this.pingTimeoutDuration ?? 0,
    };
    // The table knows a resume from a first connection by the status this
    // arrives in, and adds reconnect_completed accordingly. Either way the
    // start_ping effect arms the keepalive.
    this.machine.send({ type: 'established', pingConfig });
    this.log.info('signal connected');
    clearTimeout(timeoutHandle);
    this.startReadingLoop(connection.readable.getReader(), firstMessage);
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
  ): {
    isValid: boolean;
    response?: JoinResponse | ReconnectResponse;
    error?: ConnectionError;
    shouldProcessFirstMessage?: boolean;
  } {
    if (firstSignalResponse.message?.case === 'join') {
      return {
        isValid: true,
        response: firstSignalResponse.message.value,
      };
    } else if (
      this.state === SignalConnectionState.RECONNECTING &&
      firstSignalResponse.message?.case !== 'leave'
    ) {
      if (firstSignalResponse.message?.case === 'reconnect') {
        return {
          isValid: true,
          response: firstSignalResponse.message.value,
        };
      } else {
        // in reconnecting, any message received means signal reconnected and we still need to process it
        this.log.debug('declaring signal reconnected without reconnect response received');
        return {
          isValid: true,
          response: undefined,
          shouldProcessFirstMessage: true,
        };
      }
    } else if (this.isEstablishingConnection && firstSignalResponse.message?.case === 'leave') {
      return {
        isValid: false,
        error: ConnectionError.leaveRequest(
          'Received leave request while trying to (re)connect',
          firstSignalResponse.message.value.reason,
        ),
      };
    } else if (!isReconnect) {
      // non-reconnect case, should receive join response first
      return {
        isValid: false,
        error: ConnectionError.internal(
          `did not receive join response, got ${firstSignalResponse.message?.case} instead`,
        ),
      };
    }

    return {
      isValid: false,
      error: ConnectionError.internal('Unexpected first message'),
    };
  }

  /**
   * Handles WebSocket connection errors by validating with the server
   * @param reason The error that occurred
   * @param validateUrl The URL to validate the connection with
   * @returns A ConnectionError with appropriate reason and status
   * @internal
   */
  private async handleConnectionError(
    reason: unknown,
    validateUrl: string,
  ): Promise<ConnectionError> {
    try {
      const resp = await fetch(validateUrl);

      switch (resp.status) {
        case 404:
          const errorMsg = await resp.text();
          if (errorMsg.includes('requested room does not exist')) {
            return ConnectionError.notAllowed(errorMsg, resp.status);
          }
          return ConnectionError.serviceNotFound(
            'v1 RTC path not found. Consider upgrading your LiveKit server version',
            'v0-rtc',
          );
        case 401:
        case 403:
          const msg = await resp.text();
          return ConnectionError.notAllowed(msg, resp.status);
        default:
          break;
      }

      // The server answered and reported itself unhealthy. That is strictly
      // more informative than "the socket failed to open", so it wins over the
      // transport rejection rather than being shadowed by it.
      if (!resp.ok) {
        return ConnectionError.internal(
          `Server responded with ${resp.status} on the validate path`,
          { status: resp.status, statusText: resp.statusText },
        );
      }

      if (reason instanceof ConnectionError) {
        return reason;
      } else {
        return ConnectionError.internal(
          `Encountered unknown websocket error during connection: ${reason}`,
          { status: resp.status, statusText: resp.statusText },
        );
      }
    } catch (e) {
      return e instanceof ConnectionError
        ? e
        : ConnectionError.serverUnreachable(
            e instanceof Error ? e.message : 'server was not reachable',
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
): URLSearchParams {
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
  params.set('sdk', isReactNative() ? 'reactnative' : 'js');
  params.set('version', info.version!);
  params.set('protocol', info.protocol!.toString());
  params.set('client_protocol', info.clientProtocol!.toString());
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

async function createJoinRequestConnectionParams(
  token: string,
  info: ClientInfo,
  opts: ConnectOpts,
  publisherOffer?: SessionDescription,
): Promise<URLSearchParams> {
  const params = new URLSearchParams();
  params.set('access_token', token);

  const joinRequest = new JoinRequest({
    clientInfo: info,
    connectionSettings: new ConnectionSettings({
      autoSubscribe: !!opts.autoSubscribe,
      adaptiveStream: !!opts.adaptiveStream,
    }),
    reconnect: !!opts.reconnect,
    participantSid: opts.sid ? opts.sid : undefined,
    publisherOffer: publisherOffer,
  });
  if (opts.reconnectReason) {
    joinRequest.reconnectReason = opts.reconnectReason;
  }
  const joinRequestBytes = joinRequest.toBinary();
  let requestBytes: Uint8Array;
  let compression: WrappedJoinRequest_Compression;
  if (isCompressionStreamSupported()) {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array(joinRequestBytes));
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    requestBytes = result;
    compression = WrappedJoinRequest_Compression.GZIP;
  } else {
    requestBytes = joinRequestBytes;
    compression = WrappedJoinRequest_Compression.NONE;
  }
  const wrappedJoinRequest = new WrappedJoinRequest({
    joinRequest: requestBytes,
    compression,
  });
  const wrappedBytes = wrappedJoinRequest.toBinary();
  const bytesToBase64 = (bytes: Uint8Array) => {
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
    return btoa(binString);
  };
  params.set('join_request', bytesToBase64(wrappedBytes).replace(/\+/g, '-').replace(/\//g, '_'));

  return params;
}
