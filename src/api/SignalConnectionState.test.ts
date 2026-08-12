import { describe, expect, it } from 'vitest';
import vectors from '../../specs/signal-connection-vectors.json';
import {
  SignalConnectionStatus,
  type SignalEffectType,
  type SignalEvent,
  type SignalEventType,
  handledEvents,
  signalEdges,
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

/**
 * An event of the given type. The events are a discriminated union, so a type
 * alone is not enough. Only `transport_closed` carries data.
 */
function eventOf(type: SignalEventType): SignalEvent {
  return type === 'transport_closed' ? { type, reason: 'closed by peer' } : { type };
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

describe('vectors match the table exactly', () => {
  // The vectors are the cross-language conformance artifact, so they must not
  // drift from the table they describe. Renaming an event or retargeting an edge
  // can otherwise leave a vector that still passes while asserting the old
  // behaviour — which happened when the events were made phase-neutral.
  const edges = new Map(signalEdges().map((e) => [`${e.from}|${e.event}`, e.to as string]));
  const claimed = new Map(
    vectors.vectors.map((v) => [`${v.status}|${v.event}`, v.next as string | null]),
  );

  it('asserts the right target for every edge it covers', () => {
    const wrong = [...edges]
      .filter(([key]) => claimed.has(key))
      .filter(([key, to]) => claimed.get(key) !== to)
      .map(([key, to]) => `${key}: vector says ${claimed.get(key)}, table says ${to}`);
    expect(wrong).toEqual([]);
  });

  it('covers every edge in the table', () => {
    const uncovered = [...edges.keys()].filter((key) => !claimed.has(key));
    expect(uncovered).toEqual([]);
  });

  it('claims a rejection only where the table really has no edge', () => {
    const bogus = [...claimed]
      .filter(([key, next]) => next === null && edges.has(key))
      .map(([key]) => `${key}: vector says rejected, table routes to ${edges.get(key)}`);
    expect(bogus).toEqual([]);
  });

  it('claims a transition only where the table has an edge', () => {
    const phantom = [...claimed]
      .filter(([key, next]) => next !== null && !edges.has(key))
      .map(([key, next]) => `${key}: vector says ${next}, table has no edge`);
    expect(phantom).toEqual([]);
  });
});

describe('signal connection effects', () => {
  const effectTypes = (
    status: SignalConnectionStatus,
    event: SignalEventType,
  ): SignalEffectType[] => transition(status, eventOf(event)).effects.map((e) => e.type);

  it('connect opens the transport', () => {
    expect(effectTypes(SignalConnectionStatus.NEW, 'connect')).toEqual(['open_transport']);
  });

  it('established starts the ping', () => {
    expect(effectTypes(SignalConnectionStatus.CONNECTING, 'established')).toEqual(['start_ping']);
  });

  it('every path into closed flushes the buffer via onEntry', () => {
    const intoClosed: Array<[SignalConnectionStatus, SignalEventType]> = [
      [SignalConnectionStatus.CONNECTING, 'attempt_failed'],
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
      [SignalConnectionStatus.CONNECTING, 'established'],
      [SignalConnectionStatus.RECONNECTING, 'established'],
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
    expect(lost).toEqual({
      type: 'connection_lost',
      failure: expect.objectContaining({ message: 'Unexpected WS error' }),
    });
  });

  it('ignored events emit no effects', () => {
    expect(transition(SignalConnectionStatus.NEW, { type: 'close' }).effects).toEqual([]);
  });
});
