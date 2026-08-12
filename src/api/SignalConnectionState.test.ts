import { describe, expect, it } from 'vitest';
import vectors from '../../specs/signal-connection-vectors.json';
import {
  SignalConnectionStatus,
  type SignalEffectType,
  type SignalEvent,
  type SignalEventType,
  handledEvents,
  transition,
} from './SignalConnectionState';

const STATUS_MAP: Record<string, SignalConnectionStatus> = {
  new: SignalConnectionStatus.NEW,
  connecting: SignalConnectionStatus.CONNECTING,
  connected: SignalConnectionStatus.CONNECTED,
  suspended: SignalConnectionStatus.SUSPENDED,
  reconnecting: SignalConnectionStatus.RECONNECTING,
  disconnecting: SignalConnectionStatus.DISCONNECTING,
  closed: SignalConnectionStatus.CLOSED,
};

const PING_CONFIG = { intervalS: 5, timeoutS: 10 };
const FAILURE = {
  reason: 'internal_error',
  message: 'boom',
  retryable: true,
  supportsRegionFailover: false,
};

/**
 * A representative event of the given type. Events are a discriminated union,
 * so a type alone is not constructible — this supplies the payload each variant
 * requires, which also documents what every event must carry.
 */
function eventOf(type: SignalEventType): SignalEvent {
  switch (type) {
    case 'connect':
      return { type, url: 'wss://example.com' };
    case 'connection_established':
    case 'reconnect_established':
      return { type, pingConfig: PING_CONFIG };
    case 'connection_failed':
    case 'reconnect_attempt_failed':
      return { type, failure: FAILURE };
    case 'transport_closed':
      return { type, reason: 'closed by peer' };
    case 'leave_received_during_reconnect':
      return { type, failure: FAILURE, leaveAction: 2 };
    default:
      return { type };
  }
}

describe('signal connection transitions', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      const result = transition(
        STATUS_MAP[vector.status]!,
        eventOf(vector.event as SignalEventType),
      );

      if (vector.next === null) {
        expect(result.handled).toBe(false);
        expect(result.nextStatus).toBe(STATUS_MAP[vector.status]!);
      } else {
        expect(result.handled).toBe(true);
        expect(result.nextStatus).toBe(STATUS_MAP[vector.next]!);
      }
    });
  }
});

describe('signal connection effects', () => {
  const effectTypes = (
    status: SignalConnectionStatus,
    event: SignalEventType,
  ): SignalEffectType[] => transition(status, eventOf(event)).effects.map((e) => e.type);

  it('connect opens the transport', () => {
    expect(effectTypes(SignalConnectionStatus.NEW, 'connect')).toEqual(['open_transport']);
  });

  it('connection_established starts the ping', () => {
    expect(effectTypes(SignalConnectionStatus.CONNECTING, 'connection_established')).toEqual([
      'start_ping',
    ]);
  });

  it('every path into closed flushes the buffer via onEntry', () => {
    const intoClosed: Array<[SignalConnectionStatus, SignalEventType]> = [
      [SignalConnectionStatus.CONNECTING, 'connection_failed'],
      [SignalConnectionStatus.CONNECTING, 'close'],
      [SignalConnectionStatus.SUSPENDED, 'close'],
      [SignalConnectionStatus.RECONNECTING, 'leave_received_during_reconnect'],
      [SignalConnectionStatus.RECONNECTING, 'close'],
      [SignalConnectionStatus.DISCONNECTING, 'close_completed'],
      [SignalConnectionStatus.DISCONNECTING, 'transport_closed'],
    ];
    for (const [status, event] of intoClosed) {
      const result = transition(status, eventOf(event));
      expect(result.nextStatus).toBe(SignalConnectionStatus.CLOSED);
      expect(result.effects.at(-1)?.type).toBe('clear_queue');
    }
  });

  it('leaving connected always stops the ping first, via the exit action', () => {
    // Guards the exit action: every edge out of connected must disarm the
    // keepalive, and no edge declares stop_ping itself. A new edge added to the
    // table inherits this automatically.
    const outOfConnected = handledEvents(SignalConnectionStatus.CONNECTED);
    expect(outOfConnected.length).toBeGreaterThan(0);
    for (const event of outOfConnected) {
      const effects = effectTypes(SignalConnectionStatus.CONNECTED, event);
      expect(effects[0]).toBe('stop_ping');
      expect(effects.filter((e) => e === 'stop_ping')).toHaveLength(1);
    }
  });

  it('entering connected starts the ping and does not stop it', () => {
    for (const [status, event] of [
      [SignalConnectionStatus.CONNECTING, 'connection_established'],
      [SignalConnectionStatus.RECONNECTING, 'reconnect_established'],
    ] as Array<[SignalConnectionStatus, SignalEventType]>) {
      const effects = effectTypes(status, event);
      expect(effects).toContain('start_ping');
      expect(effects).not.toContain('stop_ping');
    }
  });

  it('a blank transport close reason falls back to a canonical message', () => {
    // An abnormal (1006) close reports an empty reason, not an absent one.
    const result = transition(SignalConnectionStatus.CONNECTED, {
      type: 'transport_closed',
      reason: '',
    });
    const lost = result.effects.find((e) => e.type === 'connection_lost');
    expect((lost?.params?.failure as { message: string }).message).toBe('Unexpected WS error');
  });

  it('ignored events emit no effects', () => {
    expect(transition(SignalConnectionStatus.NEW, { type: 'close' }).effects).toEqual([]);
  });
});
