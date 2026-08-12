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
  type MessageKind,
  SignalConnectionStatus,
  type SignalEffect,
  type SignalEvent,
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
 * The 7 statuses of the machine, mapped to the 5 values of the public enum. The
 * public enum has no value for `suspended`, which is a recoverable pause. So
 * `suspended`, `new` and `closed` all read as DISCONNECTED to a caller.
 */
const PUBLIC_STATE: Record<SignalConnectionStatus, SignalConnectionState> = {
  [SignalConnectionStatus.NEW]: SignalConnectionState.DISCONNECTED,
  [SignalConnectionStatus.CONNECTING]: SignalConnectionState.CONNECTING,
  [SignalConnectionStatus.CONNECTED]: SignalConnectionState.CONNECTED,
  [SignalConnectionStatus.SUSPENDED]: SignalConnectionState.DISCONNECTED,
  [SignalConnectionStatus.RECONNECTING]: SignalConnectionState.RECONNECTING,
  [SignalConnectionStatus.DISCONNECTING]: SignalConnectionState.DISCONNECTING,
  [SignalConnectionStatus.CLOSED]: SignalConnectionState.DISCONNECTED,
};

/**
 * One connection attempt in progress. It holds the promise of the caller. The
 * transport, a timeout, the first-message check and an abort can all end the
 * attempt. The first of them to do so settles the promise, and only once.
 */
interface PendingAttempt {
  reconnect: boolean;
  /**
   * Where to connect. This is a promise because the machine gets the event at
   * once: a caller reads `currentState` directly after join() or reconnect().
   * To build the url is asynchronous. runAttempt waits for the url before it
   * opens the transport.
   */
  endpoint: Promise<{ rtcUrl: string; validateUrl: string }>;
  /** Set when the open_transport effect started the attempt. */
  started: boolean;
  resolve: (response: JoinResponse | ReconnectResponse | undefined) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  /** A classified error is on its way; generic reporters must stand down. */
  settling: boolean;
  wsTimeout?: ReturnType<typeof setTimeout>;
  /** Releases the connection lock. It is set after runAttempt takes the lock. */
  unlock?: () => void;
  cleanup: () => void;
}

/** specifies how much time (in ms) we allow for the ws to close its connection gracefully before continuing */
const MAX_WS_CLOSE_TIME = 250;

/**
 * How long (in ms) to wait for the first message after the WebSocket upgrade.
 */
const JOIN_RESPONSE_TIMEOUT = 5_000;

/**
 * The parameters of a command. An effect that needs a parameter reads it here.
 * The context goes with its own event through the runner, so the parameters
 * cannot be lost or overwritten by another event.
 */
interface SignalCommandContext {
  attempt?: PendingAttempt;
  closeReason?: string;
}

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

  /**
   * Read the machine, and not the public state. `suspended` also reads as
   * DISCONNECTED, but a close from `suspended` is a real transition: it clears
   * the buffer.
   */
  private get isClosingOrClosed() {
    return (
      this.machine.status === SignalConnectionStatus.DISCONNECTING ||
      this.machine.status === SignalConnectionStatus.CLOSED
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
  machine: SignalConnectionRunner<SignalCommandContext>;

  private get state(): SignalConnectionState {
    return PUBLIC_STATE[this.machine.status];
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
   * Start the connection attempt that the machine authorized. This is the only
   * caller of runAttempt. An attempt starts only if the machine accepted a
   * transition that asks for a transport.
   */
  private openTransport(attempt: PendingAttempt | undefined) {
    if (!attempt || attempt.started) {
      this.log.error('open_transport without an attempt to start');
      return;
    }
    attempt.started = true;
    void this.runAttempt(attempt);
  }

  /**
   * Tell the transport to close. This starts the handshake only. The caller that
   * started the close waits for `ws.closed`, for a maximum of MAX_WS_CLOSE_TIME.
   */
  private closeTransport(reason: string | undefined) {
    this.ws?.close({ closeCode: 1000, reason: reason ?? 'Close method called on signal client' });
  }

  private createMachine(): SignalConnectionRunner<SignalCommandContext> {
    return new SignalConnectionRunner<SignalCommandContext>(
      (effects, context) => this.executeEffects(effects, context),
      {
        onStatusChanged: (status, previous) =>
          this.log.debug(`signal lifecycle: ${previous} -> ${status}`, this.logContext),
        onIgnored: (event, status) =>
          this.log.debug(`ignoring ${event.type} while ${status}`, this.logContext),
      },
    );
  }

  /**
   * Does the commands that the machine gives for a transition.
   *
   * The transport, the ping timer, the message buffer and the disconnect report
   * all start here. A transition commands each of them. No method commands them
   * directly.
   *
   * This function ignores `reconnect_completed` and `leave_received`. RTCEngine
   * and `handleSignalResponse` already report those two events. A second report
   * here would be a duplicate. The machine still gives the commands, because the
   * spec includes them.
   */
  private executeEffects(effects: SignalEffect[], context: SignalCommandContext | undefined) {
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
          this.openTransport(context?.attempt);
          break;
        case 'close_transport':
          this.closeTransport(context?.closeReason);
          break;
        case 'connection_lost':
          // The machine reports this only for a connection that reached
          // CONNECTED. That is when an unexpected disconnect must be reported.
          // The table now makes that decision.
          this.handleOnClose(effect.failure.message);
          break;
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
    // A join begins a new connection lifecycle even if one is already running: a
    // full reconnect replaces the previous connection rather than resuming it, so
    // the machine is recreated rather than driven back to the start.
    this.machine = this.createMachine();
    this.options = opts;
    const res = await this.beginAttempt(
      url,
      token,
      opts,
      { type: 'connect' },
      abortSignal,
      useV0Path,
      publisherOffer,
    );
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
    // Leaving `connected` disarms the ping as an exit action, so nothing to clear
    // here; it restarts when the attempt reports `established`.
    const res = (await this.beginAttempt(
      url,
      token,
      { ...this.options, reconnect: true, sid, reconnectReason: reason },
      { type: 'start_reconnect' },
      undefined,
      this.useV0SignalPath,
    )) as ReconnectResponse | undefined;
    return res;
  }

  /** Build the signal endpoint for an attempt. Async for the v1 join request. */
  private async buildEndpoint(
    url: string,
    token: string,
    opts: ConnectOpts,
    useV0Path: boolean,
    publisherOffer?: SessionDescription,
  ): Promise<{ rtcUrl: string; validateUrl: string }> {
    const clientInfo = getClientInfo(opts.clientInfoCapabilities);
    const params = useV0Path
      ? createConnectionParams(token, clientInfo, opts)
      : await createJoinRequestConnectionParams(token, clientInfo, opts, publisherOffer);
    const rtcUrl = createRtcUrl(url, params, useV0Path).toString();
    return { rtcUrl, validateUrl: createValidateUrl(rtcUrl).toString() };
  }

  /**
   * Ask the machine to start an attempt. Return the promise of the outcome.
   *
   * This function does no `await` before the `send`, so the status has changed
   * when the function returns. The open_transport effect starts the work. If the
   * current status does not handle the event, no work starts, and the attempt
   * fails here.
   */
  private beginAttempt(
    url: string,
    token: string,
    opts: ConnectOpts,
    event: SignalEvent,
    abortSignal?: AbortSignal,
    useV0Path: boolean = false,
    publisherOffer?: SessionDescription,
  ): Promise<JoinResponse | ReconnectResponse | undefined> {
    this.connectOptions = opts;
    this.useV0SignalPath = useV0Path;
    // Started, not awaited: the event must be raised synchronously.
    const endpoint = this.buildEndpoint(url, token, opts, useV0Path, publisherOffer);

    return new Promise<JoinResponse | ReconnectResponse | undefined>((resolve, reject) => {
      const attempt: PendingAttempt = {
        reconnect: opts.reconnect ?? false,
        endpoint,
        started: false,
        resolve,
        reject,
        settled: false,
        settling: false,
        cleanup: () => {
          clearTimeout(attempt.wsTimeout);
          abortSignal?.removeEventListener('abort', abortHandler);
          attempt.unlock?.();
        },
      };

      const abortHandler = (eventOrError: Event | Error) => {
        // An Event comes from the caller's AbortSignal; an Error is raised by us
        // (the connect timeout below).
        const isCallerAbort = eventOrError instanceof Event;
        const target = isCallerAbort ? eventOrError.currentTarget : eventOrError;
        const reason = getAbortReasonAsString(target, 'Abort handler called');
        if (attempt.settled) {
          return;
        }
        // send leave if we have an active stream writer (connection is open)
        if (this.streamWriter && !this.isDisconnected) {
          this.sendLeave()
            .then(() => this.close(true, reason))
            .catch((e) => {
              this.log.error(e);
              this.close();
            });
        } else {
          this.close();
        }
        // Only the caller aborting is a cancellation. An error we raised
        // ourselves keeps its own reason, so callers can tell "gave up waiting"
        // from "caller cancelled" — they retry differently.
        this.failAttempt(
          attempt,
          !isCallerAbort && eventOrError instanceof ConnectionError
            ? eventOrError
            : ConnectionError.cancelled(reason),
        );
      };

      abortSignal?.addEventListener('abort', abortHandler);
      attempt.wsTimeout = setTimeout(() => {
        abortHandler(ConnectionError.timeout('room connection has timed out (signal)'));
      }, opts.websocketTimeout);

      // The machine authorizes the transport with open_transport, and that
      // command starts the attempt. If the current status does not handle the
      // event, the attempt does not start and there is no work to wait for.
      this.machine.send(event, { attempt });
      if (!attempt.started) {
        this.failAttempt(
          attempt,
          ConnectionError.internal(
            `cannot ${opts.reconnect ? 'reconnect' : 'connect'} while ${this.machine.status}`,
          ),
        );
      }
    });
  }

  /**
   * Do one connection attempt. Open the transport, read the first message and
   * check it. Then report the outcome to the machine and settle the promise of
   * the caller. Each exit reports to the machine one time. The table then gives
   * the correct status for the phase.
   */
  private async runAttempt(attempt: PendingAttempt) {
    // Do one attempt at a time, as connect() did before. attempt.cleanup()
    // releases the lock, so the path that settles the attempt also frees it.
    const unlock = await this.connectionLock.lock();
    if (attempt.settled) {
      unlock();
      return;
    }
    attempt.unlock = unlock;

    let rtcUrl: string;
    try {
      ({ rtcUrl } = await attempt.endpoint);
    } catch (e) {
      this.machine.send({ type: 'attempt_failed' });
      this.failAttempt(attempt, e);
      return;
    }
    if (attempt.settled) {
      return;
    }

    const redactedUrl = new URL(rtcUrl);
    if (redactedUrl.searchParams.has('access_token')) {
      redactedUrl.searchParams.set('access_token', '<redacted>');
    }
    this.log.info(`signal connecting to ${redactedUrl}`, { reconnect: attempt.reconnect });

    if (this.ws) {
      const startClose = performance.now();
      // updateState = false: to replace the transport is not a lifecycle event.
      await this.close(false);
      this.log.debug(`closed previous ws connection in ${performance.now() - startClose}ms`);
    }

    const ws = new WebSocketStream<ArrayBuffer>(rtcUrl);
    this.ws = ws;

    const onTransportGone = (reason: string, detail: string) => {
      // Ignore a socket that a later attempt replaced. Its late close must not
      // move the status of the new attempt. `close()` clears this.ws, so a close
      // that we started still reports here.
      if (this.ws && this.ws !== ws) {
        return;
      }
      // Report the loss. The table decides what it means. From CONNECTED the
      // status becomes suspended, and connection_lost then calls onClose. In all
      // other phases the failure of this attempt is the outcome.
      this.machine.send({ type: 'transport_closed', reason });
      // If `settling` is true, a more exact error will follow. Do not replace
      // that error with this general one.
      if (!attempt.settling) {
        this.failAttempt(attempt, ConnectionError.internal(detail));
      }
    };

    ws.closed
      .then((closeInfo) => {
        // Code 1000 is a close that we asked for. It is not a loss of the
        // transport. A report would make an intentional close, or the removal of
        // the transport for a reconnect, into a lifecycle event.
        if (closeInfo.closeCode === 1000) {
          return;
        }
        this.log.warn(`websocket closed`, {
          reason: closeInfo.reason,
          code: closeInfo.closeCode,
          wasClean: false,
          state: this.state,
        });
        onTransportGone(
          closeInfo.reason ?? '',
          `Websocket got closed during a (re)connection attempt: ${closeInfo.reason}`,
        );
      })
      .catch((reason) => {
        onTransportGone('', `Websocket error during a (re)connection attempt: ${reason}`);
      });

    let connection: WebSocketConnection;
    try {
      connection = await ws.opened;
    } catch (reason) {
      clearTimeout(attempt.wsTimeout);
      if (this.machine.status === SignalConnectionStatus.CONNECTED) {
        // A live connection outlived this attempt; surface the error as-is.
        this.handleWSError(reason);
        this.failAttempt(attempt, reason);
        return;
      }
      // Claim the attempt before the wait for the error class. The
      // transport_closed handler must not end the attempt with a general error
      // during that wait.
      attempt.settling = true;
      this.machine.send({ type: 'attempt_failed' });
      const { validateUrl } = await attempt.endpoint;
      const error = await this.handleConnectionError(reason, validateUrl);
      attempt.settling = false;
      this.failAttempt(attempt, error);
      return;
    }
    clearTimeout(attempt.wsTimeout);

    const signalReader = connection.readable.getReader();
    this.streamWriter = connection.writable.getWriter();

    // wsTimeout only guarded the upgrade; guard the first-message read with its
    // own timeout so a silent server can't hang the attempt forever.
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
      signalReader.releaseLock();
      // The table routes this by phase: terminal for an initial connect,
      // recoverable (suspended) for a reconnect.
      this.machine.send({ type: 'attempt_timed_out' });
      this.failAttempt(attempt, e);
      // The machine has already recorded why the attempt ended, so tear the
      // transport down without emitting a further lifecycle event.
      this.close(false);
      return;
    } finally {
      clearTimeout(firstMessageTimeout);
    }
    signalReader.releaseLock();

    try {
      if (!firstMessage.value) {
        throw ConnectionError.internal('no message received as first message');
      }
      const firstSignalResponse = parseSignalResponse(firstMessage.value);
      const validation = this.validateFirstMessage(firstSignalResponse, attempt.reconnect);
      if (!validation.isValid) {
        this.failAttempt(attempt, validation.error);
        return;
      }

      if (firstSignalResponse.message?.case === 'join') {
        this.pingTimeoutDuration = firstSignalResponse.message.value.pingTimeout;
        this.pingIntervalDuration = firstSignalResponse.message.value.pingInterval;
        if (this.pingTimeoutDuration && this.pingTimeoutDuration > 0) {
          this.log.debug('ping config', {
            timeout: this.pingTimeoutDuration,
            interval: this.pingIntervalDuration,
          });
        }
        this.onJoined?.(firstSignalResponse.message.value);
      }

      this.handleSignalConnected(
        connection,
        attempt.wsTimeout!,
        validation.shouldProcessFirstMessage ? firstSignalResponse : undefined,
      );
      this.completeAttempt(attempt, validation.response);
    } catch (e) {
      this.failAttempt(attempt, e);
    }
  }

  /** Resolve the pending attempt, at most once. */
  private completeAttempt(
    attempt: PendingAttempt,
    response: JoinResponse | ReconnectResponse | undefined,
  ) {
    if (attempt.settled) return;
    attempt.settled = true;
    attempt.cleanup();
    attempt.resolve(response);
  }

  /** Reject the pending attempt, at most once. */
  private failAttempt(attempt: PendingAttempt, error: unknown) {
    if (attempt.settled) return;
    attempt.settled = true;
    attempt.cleanup();
    attempt.reject(error);
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
    if (this.isClosingOrClosed) {
      this.log.debug('ignoring signal close: the connection is already closing or closed');
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
        this.machine.send({ type: 'close' }, { closeReason: reason });
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
    // The status this arrives in tells the table whether this is a resume or a
    // first connection. The start_ping effect starts the ping in both cases. The
    // ping durations are executor state, so the event does not carry them.
    this.machine.send({ type: 'established' });
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
