import { type EventMap } from 'typed-emitter';
import type TypedEventEmitter from 'typed-emitter';

/** A test helper to listen to events received by an event emitter and allow them to be imperatively
 * queried after the fact. */
export function subscribeToEvents<
  Callbacks extends EventMap,
  EventNames extends keyof Callbacks = keyof Callbacks,
>(eventEmitter: TypedEventEmitter<Callbacks>, eventNames: Array<EventNames>) {
  const nextEventListeners = new Map<EventNames, Array<Future<unknown, never>>>(
    eventNames.map((eventName) => [eventName, []]),
  );
  const buffers = new Map<EventNames, Array<unknown>>(
    eventNames.map((eventName) => [eventName, []]),
  );

  const eventHandlers = eventNames.map((eventName) => {
    const onEvent = ((event: unknown) => {
      const listeners = nextEventListeners.get(eventName)!;
      if (listeners.length > 0) {
        for (const listener of listeners) {
          listener.resolve?.(event);
        }
        nextEventListeners.set(eventName, []);
      } else {
        buffers.get(eventName)!.push(event);
      }
    }) as Callbacks[keyof Callbacks];
    return [eventName, onEvent] as [keyof Callbacks, Callbacks[keyof Callbacks]];
  });
  for (const [eventName, onEvent] of eventHandlers) {
    eventEmitter.on(eventName, onEvent);
  }

  return {
    /** Listen for the next occurrance of an event to be emitted, or return the last event that was
      * buffered (but hasn't been processed yet). */
    async waitFor<
      EventPayload extends Parameters<Callbacks[EventName]>[0],
      EventName extends EventNames = EventNames,
    >(eventName: EventName): Promise<EventPayload> {
      // If an event is already buffered which hasn't been processed yet, pull that off the buffer
      // and use it.
      const earliestBufferedEvent = buffers.get(eventName)!.shift();
      if (earliestBufferedEvent) {
        return earliestBufferedEvent as EventPayload;
      }

      // Otherwise wait for the next event to come in.
      const future = new Future<unknown, never>();
      nextEventListeners.get(eventName)!.push(future);
      const nextEvent = await future.promise;
      return nextEvent as EventPayload;
    },
    /** Cleanup any lingering subscriptions. */
    unsubscribe: () => {
      for (const [eventName, onEvent] of eventHandlers) {
        eventEmitter.off(eventName, onEvent);
      }
    },
  };
}

