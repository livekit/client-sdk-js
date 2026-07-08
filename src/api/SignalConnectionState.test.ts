import { describe, expect, it } from 'vitest';
import vectors from '../../specs/signal-connection-vectors.json';
import { ConnectionErrorReason } from '../room/errors';
import {
  type ConnectionFailure,
  type PingConfig,
  SignalConnectionMachine,
  SignalConnectionStatus,
  type SignalEffect,
  type SignalMessage,
  type SignalState,
  type SignalTrigger,
} from './SignalConnectionState';

// ---------------------------------------------------------------------------
// Mapping from spec-domain strings to SDK types
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, SignalConnectionStatus> = {
  new: SignalConnectionStatus.NEW,
  connecting: SignalConnectionStatus.CONNECTING,
  connected: SignalConnectionStatus.CONNECTED,
  suspended: SignalConnectionStatus.SUSPENDED,
  reconnecting: SignalConnectionStatus.RECONNECTING,
  disconnecting: SignalConnectionStatus.DISCONNECTING,
  closed: SignalConnectionStatus.CLOSED,
};

const FAILURE_REASON_MAP: Record<string, ConnectionErrorReason> = {
  not_allowed: ConnectionErrorReason.NotAllowed,
  server_unreachable: ConnectionErrorReason.ServerUnreachable,
  internal_error: ConnectionErrorReason.InternalError,
  cancelled: ConnectionErrorReason.Cancelled,
  leave_request: ConnectionErrorReason.LeaveRequest,
  connection_timeout: ConnectionErrorReason.Timeout,
  ping_timeout: ConnectionErrorReason.Timeout,
  transport_error: ConnectionErrorReason.WebSocket,
  service_not_found: ConnectionErrorReason.ServiceNotFound,
};

// ---------------------------------------------------------------------------
// Vector → SDK type converters
// ---------------------------------------------------------------------------

function toPingConfig(v: { interval_s: number; timeout_s: number } | null): PingConfig | null {
  return v ? { intervalS: v.interval_s, timeoutS: v.timeout_s } : null;
}

function toMessage(v: { payload: unknown }): SignalMessage {
  return { payload: v.payload };
}

function toFailure(v: {
  reason: string;
  message?: string;
  retryable: boolean;
  supports_region_failover: boolean;
}): ConnectionFailure {
  return {
    reason: FAILURE_REASON_MAP[v.reason]!,
    ...(v.message !== undefined ? { message: v.message } : {}),
    retryable: v.retryable,
    supportsRegionFailover: v.supports_region_failover,
  };
}

function toState(v: {
  status: string;
  queued_messages: Array<{ payload: unknown }>;
  ping_config: { interval_s: number; timeout_s: number } | null;
  url: string | null;
}): SignalState {
  return {
    status: STATUS_MAP[v.status]!,
    queuedMessages: v.queued_messages.map(toMessage),
    pingConfig: toPingConfig(v.ping_config),
    url: v.url,
  };
}

function toTrigger(v: Record<string, any>): SignalTrigger {
  switch (v.type) {
    case 'connect':
      return { type: 'connect', url: v.url };
    case 'connection_established':
      return { type: 'connection_established', pingConfig: toPingConfig(v.ping_config)! };
    case 'connection_failed':
      return { type: 'connection_failed', failure: toFailure(v.failure) };
    case 'connection_timed_out':
      return { type: 'connection_timed_out' };
    case 'start_reconnect':
      return { type: 'start_reconnect' };
    case 'reconnect_established':
      return { type: 'reconnect_established', pingConfig: toPingConfig(v.ping_config)! };
    case 'reconnect_attempt_failed':
      return { type: 'reconnect_attempt_failed', failure: toFailure(v.failure) };
    case 'reconnect_timed_out':
      return { type: 'reconnect_timed_out' };
    case 'leave_received_during_reconnect':
      return {
        type: 'leave_received_during_reconnect',
        failure: toFailure(v.failure),
        leaveAction: v.leave_action,
      };
    case 'send_passthrough':
      return { type: 'send_passthrough', message: toMessage(v.message) };
    case 'enqueue_message':
      return { type: 'enqueue_message', message: toMessage(v.message) };
    case 'drain_queue':
      return { type: 'drain_queue' };
    case 'ping_timeout':
      return { type: 'ping_timeout' };
    case 'transport_closed':
      return { type: 'transport_closed', reason: v.reason };
    case 'close':
      return { type: 'close' };
    case 'close_completed':
      return { type: 'close_completed' };
    default:
      throw new Error(`Unknown trigger type: ${v.type}`);
  }
}

function toEffect(v: Record<string, any>): SignalEffect {
  switch (v.type) {
    case 'open_transport':
      return { type: 'open_transport', url: v.url, reconnect: v.reconnect };
    case 'close_transport':
      return { type: 'close_transport' };
    case 'start_ping':
      return { type: 'start_ping', config: toPingConfig(v.config)! };
    case 'stop_ping':
      return { type: 'stop_ping' };
    case 'dispatch_message':
      return { type: 'dispatch_message', message: toMessage(v.message) };
    case 'queue_message':
      return { type: 'queue_message', message: toMessage(v.message) };
    case 'drain_queue':
      return { type: 'drain_queue', messages: v.messages.map(toMessage) };
    case 'clear_queue':
      return { type: 'clear_queue' };
    case 'connection_lost':
      return { type: 'connection_lost', failure: toFailure(v.failure) };
    case 'reconnect_completed':
      return { type: 'reconnect_completed' };
    case 'leave_received':
      return { type: 'leave_received', leaveAction: v.leave_action };
    default:
      throw new Error(`Unknown effect type: ${v.type}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: hydrate a machine to match a vector's initial state
// ---------------------------------------------------------------------------

function createMachineFromState(state: SignalState): SignalConnectionMachine {
  const machine = new SignalConnectionMachine(state.status);
  machine.queuedMessages = state.queuedMessages;
  machine.pingConfig = state.pingConfig;
  machine.url = state.url;
  return machine;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

describe('SignalConnectionState (spec vectors)', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      const initialState = toState(vector.initial_state);
      const machine = createMachineFromState(initialState);
      const trigger = toTrigger(vector.trigger);
      const effects = machine.handle(trigger);

      if ('expected_result' in vector && vector.expected_result === 'rejected') {
        expect(effects).toBeNull();
        return;
      }

      expect(effects).not.toBeNull();
      expect(machine.state).toEqual(toState(vector.expected_state!));
      expect(effects).toEqual(vector.expected_effects!.map(toEffect));
    });
  }
});
