import { describe, expect, it } from 'vitest';
import vectors from '../../specs/signal-connection-vectors.json';
import {
  type SignalEffectType,
  SignalConnectionStatus,
  type SignalEventType,
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

describe('signal connection transitions', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      const result = transition(STATUS_MAP[vector.status]!, {
        type: vector.event as SignalEventType,
      });

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
  const effectTypes = (status: SignalConnectionStatus, event: SignalEventType): SignalEffectType[] =>
    transition(status, { type: event }).effects.map((e) => e.type);

  it('connect opens the transport', () => {
    expect(effectTypes(SignalConnectionStatus.NEW, 'connect')).toEqual(['open_transport']);
  });

  it('connection_established starts the ping', () => {
    expect(effectTypes(SignalConnectionStatus.CONNECTING, 'connection_established')).toEqual(['start_ping']);
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
      const result = transition(status, { type: event });
      expect(result.nextStatus).toBe(SignalConnectionStatus.CLOSED);
      expect(result.effects.at(-1)?.type).toBe('clear_queue');
    }
  });

  it('leaving connected always stops the ping', () => {
    for (const event of ['transport_closed', 'ping_timeout', 'start_reconnect', 'close'] as SignalEventType[]) {
      expect(effectTypes(SignalConnectionStatus.CONNECTED, event)).toContain('stop_ping');
    }
  });

  it('ignored events emit no effects', () => {
    expect(transition(SignalConnectionStatus.NEW, { type: 'close' }).effects).toEqual([]);
  });
});
