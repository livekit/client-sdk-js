/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTrackOutgoingManager from './manager';
import type TypedEventEmitter from 'typed-emitter';
import { type EventMap } from 'typed-emitter';
import { Future } from '../../utils';

/** A test helper to listen to events received by an event emitter and allow them to be imperatively
  * queried after the fact. */
function subscribeToEvents<
  EventNames extends keyof Callbacks,
  Callbacks extends EventMap,
>(eventEmitter: TypedEventEmitter<Callbacks>, eventNames: Array<EventNames>) {
  const nextEventListeners = new Map<EventNames, Array<Future<unknown, never>>>(
    eventNames.map(eventName => [eventName, []])
  );
  const buffers = new Map<EventNames, Array<unknown>>(
    eventNames.map(eventName => [eventName, []])
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
    async waitFor<
      EventName extends EventNames,
      EventPayload extends Parameters<Callbacks[EventName]>[0],
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
    unsubscribe: () => {
      for (const [eventName, onEvent] of eventHandlers) {
        eventEmitter.off(eventName, onEvent);
      }
    },
  };
}

describe('DataTrackOutgoingManager', () => {
  it('should test track publishing', async () => {
    const manager = new DataTrackOutgoingManager();
    const managerEvents = subscribeToEvents(manager, [
      "sfuPublishRequest",
      "sfuUnpublishRequest",
    ]);

    // 1. Publish a data track
    const publishRequestPromise = manager.handlePublishRequest({
      type: "publishRequest",
      options: { name: "test" },
    });

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor("sfuPublishRequest");
    expect(sfuPublishEvent.name).toStrictEqual("test");
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(false);
    const handle = sfuPublishEvent.handle;

    // 3. Respond to the SFU publish request with a response
    manager.handleSfuPublishResponse({
      type: "sfuPublishResponse",
      handle,
      result: {
        type: 'ok',
        data: {
          sid: 'bogus-sid',
          pubHandle: sfuPublishEvent.handle,
          name: "test",
          usesE2ee: false,
        },
      },
    });

    // Make sure that the original input event resolves.
    const localDataTrack = await publishRequestPromise;
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // Unpublish data track
    const unpublishRequestPromise = manager.handleUnpublishRequest({ type: "unpublishRequest", handle });
    const sfuUnpublishEvent = await managerEvents.waitFor("sfuUnpublishRequest");

    await unpublishRequestPromise;

    // Make sure data track is no longer
    expect(manager.getDescriptor(1)).toStrictEqual(null);
  });
});
