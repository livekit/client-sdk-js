import { describe, expect, it, vi } from 'vitest';
import { SignalConnectionRunner } from './SignalConnectionRunner';
import {
  SignalConnectionStatus,
  type SignalEffect,
  type SignalEvent,
} from './SignalConnectionState';

/** Collects every effect the runner dispatches, flattened in dispatch order. */
function collecting() {
  const effects: SignalEffect[] = [];
  const batches: SignalEffect[][] = [];
  const sink = (batch: SignalEffect[]) => {
    batches.push(batch);
    effects.push(...batch);
  };
  return { effects, batches, sink, types: () => effects.map((e) => e.type) };
}

describe('SignalConnectionRunner', () => {
  it('advances status synchronously and dispatches that event effects', () => {
    const c = collecting();
    const runner = new SignalConnectionRunner(c.sink);

    expect(runner.status).toBe(SignalConnectionStatus.NEW);
    runner.send({ type: 'connect' });

    // No await anywhere: the status is already committed when send() returns.
    expect(runner.status).toBe(SignalConnectionStatus.CONNECTING);
    expect(c.types()).toEqual(['open_transport']);
  });

  it('is the only writer: an ignored event leaves the status untouched', () => {
    const c = collecting();
    const onIgnored = vi.fn();
    const runner = new SignalConnectionRunner(c.sink, { onIgnored });

    runner.send({ type: 'close' }); // not handled in NEW

    expect(runner.status).toBe(SignalConnectionStatus.NEW);
    expect(c.effects).toEqual([]);
    expect(onIgnored).toHaveBeenCalledOnce();
    expect(onIgnored.mock.calls[0][0]).toEqual({ type: 'close' });
    expect(onIgnored.mock.calls[0][1]).toBe(SignalConnectionStatus.NEW);
  });

  it('commits the status before effects run, so a sink observes the new status', () => {
    const seen: SignalConnectionStatus[] = [];
    const runner = new SignalConnectionRunner(() => seen.push(runner.status), {
      initialStatus: SignalConnectionStatus.CONNECTED,
    });

    runner.send({ type: 'start_reconnect' });

    expect(seen).toEqual([SignalConnectionStatus.RECONNECTING]);
  });

  it('runs each event to completion: a re-entrant send is queued, not recursed', () => {
    // The ESP32 engine re-enqueues from inside a state hook rather than
    // recursing. Same guarantee here: an effect handler that submits an event
    // must not interleave with the event currently being processed.
    const order: string[] = [];
    let runner: SignalConnectionRunner;
    const sink = (effects: SignalEffect[]) => {
      for (const effect of effects) {
        order.push(`effect:${effect.type}`);
        if (effect.type === 'open_transport') {
          // Re-entrant: arrives while this event's effects are still dispatching.
          order.push(`send:established@${runner.status}`);
          runner.send({ type: 'established' });
          // Still processing the previous event, so nothing has advanced yet.
          order.push(`after-send:${runner.status}`);
          expect(runner.queueDepth).toBe(1);
        }
      }
    };
    runner = new SignalConnectionRunner(sink);

    runner.send({ type: 'connect' });

    expect(order).toEqual([
      'effect:open_transport',
      'send:established@connecting',
      'after-send:connecting',
      'effect:start_ping',
    ]);
    expect(runner.status).toBe(SignalConnectionStatus.CONNECTED);
    expect(runner.queueDepth).toBe(0);
  });

  it('reports each real status change once, and never for an ignored event', () => {
    const c = collecting();
    const onStatusChanged = vi.fn();
    const runner = new SignalConnectionRunner(c.sink, { onStatusChanged });

    runner.send({ type: 'connect' });
    runner.send({ type: 'established' });
    runner.send({ type: 'connect' }); // ignored in CONNECTED

    expect(onStatusChanged.mock.calls.map(([to, from]) => `${from}->${to}`)).toEqual([
      'new->connecting',
      'connecting->connected',
    ]);
  });

  it('emits the exit action once when leaving connected, whichever edge is taken', () => {
    for (const event of [
      { type: 'ping_timeout' },
      { type: 'start_reconnect' },
      { type: 'close' },
      { type: 'transport_closed', reason: 'gone' },
    ] as SignalEvent[]) {
      const c = collecting();
      const runner = new SignalConnectionRunner(c.sink, {
        initialStatus: SignalConnectionStatus.CONNECTED,
      });
      runner.send(event);
      expect(c.types()[0]).toBe('stop_ping');
      expect(c.types().filter((t) => t === 'stop_ping')).toHaveLength(1);
    }
  });

  it('does not wedge when a sink throws', () => {
    // One failing effect handler must not leave the runner permanently draining
    // and silently swallowing every later event.
    const runner = new SignalConnectionRunner(() => {
      throw new Error('sink blew up');
    });

    expect(() => runner.send({ type: 'connect' })).toThrow('sink blew up');
    expect(runner.status).toBe(SignalConnectionStatus.CONNECTING);

    // Still accepts events afterwards.
    const runner2 = new SignalConnectionRunner(() => {});
    runner2.send({ type: 'connect', url: 'wss://example.com' });
    expect(runner2.status).toBe(SignalConnectionStatus.CONNECTING);
  });
});
