import { SyncStateMachine, t } from 'typescript-fsm';
import { ConnectionErrorReason } from '../room/errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export enum SignalConnectionStatus {
  NEW = 'new',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SUSPENDED = 'suspended',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  CLOSED = 'closed',
}

export enum SignalEvent {
  CONNECT = 'connect',
  CONNECTION_ESTABLISHED = 'connection_established',
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_TIMED_OUT = 'connection_timed_out',
  START_RECONNECT = 'start_reconnect',
  RECONNECT_ESTABLISHED = 'reconnect_established',
  RECONNECT_ATTEMPT_FAILED = 'reconnect_attempt_failed',
  RECONNECT_TIMED_OUT = 'reconnect_timed_out',
  LEAVE_RECEIVED_DURING_RECONNECT = 'leave_received_during_reconnect',
  SEND_PASSTHROUGH = 'send_passthrough',
  ENQUEUE_MESSAGE = 'enqueue_message',
  DRAIN_QUEUE = 'drain_queue',
  PING_TIMEOUT = 'ping_timeout',
  TRANSPORT_CLOSED = 'transport_closed',
  CLOSE = 'close',
  CLOSE_COMPLETED = 'close_completed',
}

export interface SignalMessage {
  payload: unknown;
}

export interface ConnectionFailure {
  reason: ConnectionErrorReason;
  message?: string;
  retryable: boolean;
  supportsRegionFailover: boolean;
}

export interface PingConfig {
  intervalS: number;
  timeoutS: number;
}

export type SignalEffect =
  // I/O commands
  | { type: 'open_transport'; url: string; reconnect: boolean }
  | { type: 'close_transport' }
  // Ping lifecycle
  | { type: 'start_ping'; config: PingConfig }
  | { type: 'stop_ping' }
  // Message routing
  | { type: 'dispatch_message'; message: SignalMessage }
  | { type: 'queue_message'; message: SignalMessage }
  | { type: 'drain_queue'; messages: SignalMessage[] }
  | { type: 'clear_queue' }
  // Notifications to orchestrator
  | { type: 'connection_lost'; failure: ConnectionFailure }
  | { type: 'reconnect_completed' }
  | { type: 'leave_received'; leaveAction: number };

export type SignalTrigger =
  | { type: 'connect'; url: string }
  | { type: 'connection_established'; pingConfig: PingConfig }
  | { type: 'connection_failed'; failure: ConnectionFailure }
  | { type: 'connection_timed_out' }
  | { type: 'start_reconnect' }
  | { type: 'reconnect_established'; pingConfig: PingConfig }
  | { type: 'reconnect_attempt_failed'; failure: ConnectionFailure }
  | { type: 'reconnect_timed_out' }
  | { type: 'leave_received_during_reconnect'; failure: ConnectionFailure; leaveAction: number }
  | { type: 'send_passthrough'; message: SignalMessage }
  | { type: 'enqueue_message'; message: SignalMessage }
  | { type: 'drain_queue' }
  | { type: 'ping_timeout' }
  | { type: 'transport_closed'; reason: string }
  | { type: 'close' }
  | { type: 'close_completed' };

export interface SignalState {
  status: SignalConnectionStatus;
  queuedMessages: SignalMessage[];
  pingConfig: PingConfig | null;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Signal connection state machine
// ---------------------------------------------------------------------------

const S = SignalConnectionStatus;
const E = SignalEvent;

const EVENT_MAP: Record<string, SignalEvent> = {
  connect: E.CONNECT,
  connection_established: E.CONNECTION_ESTABLISHED,
  connection_failed: E.CONNECTION_FAILED,
  connection_timed_out: E.CONNECTION_TIMED_OUT,
  start_reconnect: E.START_RECONNECT,
  reconnect_established: E.RECONNECT_ESTABLISHED,
  reconnect_attempt_failed: E.RECONNECT_ATTEMPT_FAILED,
  reconnect_timed_out: E.RECONNECT_TIMED_OUT,
  leave_received_during_reconnect: E.LEAVE_RECEIVED_DURING_RECONNECT,
  send_passthrough: E.SEND_PASSTHROUGH,
  enqueue_message: E.ENQUEUE_MESSAGE,
  drain_queue: E.DRAIN_QUEUE,
  ping_timeout: E.PING_TIMEOUT,
  transport_closed: E.TRANSPORT_CLOSED,
  close: E.CLOSE,
  close_completed: E.CLOSE_COMPLETED,
};

const silentLogger = { error() {} };

export class SignalConnectionMachine extends SyncStateMachine<SignalConnectionStatus, SignalEvent> {
  queuedMessages: SignalMessage[] = [];

  pingConfig: PingConfig | null = null;

  url: string | null = null;

  constructor(initial: SignalConnectionStatus = S.NEW) {
    super(initial, [], silentLogger);
    this.addTransitions([
      t(S.NEW, E.CONNECT, S.CONNECTING),
      t(S.CONNECTING, E.CONNECTION_ESTABLISHED, S.CONNECTED),
      t(S.CONNECTING, E.CONNECTION_FAILED, S.CLOSED),
      t(S.CONNECTING, E.CONNECTION_TIMED_OUT, S.CLOSED),

      t(S.CONNECTED, E.TRANSPORT_CLOSED, S.SUSPENDED),
      t(S.CONNECTED, E.PING_TIMEOUT, S.SUSPENDED),

      t(S.CONNECTED, E.START_RECONNECT, S.RECONNECTING),
      t(S.SUSPENDED, E.START_RECONNECT, S.RECONNECTING),
      t(S.RECONNECTING, E.RECONNECT_ESTABLISHED, S.CONNECTED),
      t(S.RECONNECTING, E.RECONNECT_ATTEMPT_FAILED, S.SUSPENDED),
      t(S.RECONNECTING, E.RECONNECT_TIMED_OUT, S.SUSPENDED),
      t(S.RECONNECTING, E.LEAVE_RECEIVED_DURING_RECONNECT, S.CLOSED),

      t(S.CONNECTING, E.SEND_PASSTHROUGH, S.CONNECTING),
      t(S.CONNECTED, E.SEND_PASSTHROUGH, S.CONNECTED),
      t(S.RECONNECTING, E.SEND_PASSTHROUGH, S.RECONNECTING),

      t(S.CONNECTED, E.ENQUEUE_MESSAGE, S.CONNECTED),
      t(S.RECONNECTING, E.ENQUEUE_MESSAGE, S.RECONNECTING),
      t(S.SUSPENDED, E.ENQUEUE_MESSAGE, S.SUSPENDED),

      t(S.CONNECTED, E.DRAIN_QUEUE, S.CONNECTED),

      t(S.CONNECTED, E.CLOSE, S.DISCONNECTING),
      t(S.SUSPENDED, E.CLOSE, S.CLOSED),
      t(S.DISCONNECTING, E.CLOSE_COMPLETED, S.CLOSED),
    ]);
  }

  get status(): SignalConnectionStatus {
    return this.getState();
  }

  get state(): SignalState {
    return {
      status: this.status,
      queuedMessages: this.queuedMessages,
      pingConfig: this.pingConfig,
      url: this.url,
    };
  }

  handle(trigger: SignalTrigger): SignalEffect[] | null {
    const event = EVENT_MAP[trigger.type];
    if (!this.can(event)) {
      return null;
    }

    const previousStatus = this.status;
    this.syncDispatch(event);

    const effects: SignalEffect[] = [];

    switch (trigger.type) {
      case 'connect':
        this.url = trigger.url;
        effects.push({ type: 'open_transport', url: trigger.url, reconnect: false });
        break;

      case 'connection_established':
        this.pingConfig = trigger.pingConfig;
        effects.push({ type: 'start_ping', config: trigger.pingConfig });
        break;

      case 'connection_failed':
        this.pingConfig = null;
        effects.push({ type: 'connection_lost', failure: trigger.failure });
        break;

      case 'connection_timed_out':
        this.pingConfig = null;
        effects.push({
          type: 'connection_lost',
          failure: {
            reason: ConnectionErrorReason.Timeout,
            message: 'Connection timed out',
            retryable: true,
            supportsRegionFailover: true,
          },
        });
        break;

      case 'transport_closed':
        this.pingConfig = null;
        effects.push({ type: 'stop_ping' });
        effects.push({
          type: 'connection_lost',
          failure: {
            reason: ConnectionErrorReason.WebSocket,
            message: trigger.reason,
            retryable: true,
            supportsRegionFailover: false,
          },
        });
        break;

      case 'ping_timeout':
        this.pingConfig = null;
        effects.push({ type: 'stop_ping' });
        effects.push({
          type: 'connection_lost',
          failure: {
            reason: ConnectionErrorReason.Timeout,
            message: 'Ping timeout',
            retryable: true,
            supportsRegionFailover: false,
          },
        });
        break;

      case 'start_reconnect':
        if (previousStatus === S.CONNECTED) {
          effects.push({ type: 'stop_ping' });
        }
        this.pingConfig = null;
        effects.push({ type: 'open_transport', url: this.url!, reconnect: true });
        break;

      case 'reconnect_established':
        this.pingConfig = trigger.pingConfig;
        effects.push({ type: 'reconnect_completed' });
        effects.push({ type: 'start_ping', config: trigger.pingConfig });
        break;

      case 'reconnect_attempt_failed':
        effects.push({ type: 'connection_lost', failure: trigger.failure });
        break;

      case 'reconnect_timed_out':
        effects.push({
          type: 'connection_lost',
          failure: {
            reason: ConnectionErrorReason.Timeout,
            message: 'Connection timed out',
            retryable: true,
            supportsRegionFailover: true,
          },
        });
        break;

      case 'leave_received_during_reconnect':
        this.queuedMessages = [];
        this.pingConfig = null;
        effects.push({ type: 'clear_queue' });
        effects.push({ type: 'connection_lost', failure: trigger.failure });
        effects.push({ type: 'leave_received', leaveAction: trigger.leaveAction });
        break;

      case 'send_passthrough':
        effects.push({ type: 'dispatch_message', message: trigger.message });
        break;

      case 'enqueue_message': {
        const { message } = trigger;
        if (previousStatus === S.CONNECTED) {
          effects.push({ type: 'dispatch_message', message });
        } else {
          this.queuedMessages = [...this.queuedMessages, message];
          effects.push({ type: 'queue_message', message });
        }
        break;
      }

      case 'drain_queue': {
        const messages = this.queuedMessages;
        this.queuedMessages = [];
        if (messages.length > 0) {
          effects.push({ type: 'drain_queue', messages });
        }
        break;
      }

      case 'close':
        if (previousStatus === S.CONNECTED) {
          effects.push({ type: 'stop_ping' });
          effects.push({ type: 'close_transport' });
        } else if (previousStatus === S.SUSPENDED) {
          this.queuedMessages = [];
          this.pingConfig = null;
          effects.push({ type: 'clear_queue' });
        }
        break;

      case 'close_completed':
        this.queuedMessages = [];
        this.pingConfig = null;
        effects.push({ type: 'clear_queue' });
        break;
    }

    return effects;
  }
}
