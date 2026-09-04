# Transcription Back-Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `RoomEvent.TranscriptionReceived` (and its `ParticipantEvent` / `TrackEvent`
siblings) from `lk.transcription` data streams instead of legacy `Transcription` data packets, and
advertise client protocol 3 so agents can stop publishing the legacy copy.

**Architecture:** A new pure `TranscriptionStreamConverter` accumulates `lk.transcription` text
streams into synthesized `Transcription` protobuf messages and feeds them to the existing
`Room.handleTranscription` emit path. `IncomingDataStreamManager` becomes a typed event emitter and
taps the reserved topic with a `transcriptionStreamArrived` event, so the SDK can read
`lk.transcription` without stealing the topic from an application handler. Legacy `Transcription`
packets are ignored unconditionally — there is no gate.

**Tech Stack:** TypeScript, vitest, `@livekit/protocol` (protobuf-es), Web Streams API.

**Spec:** `docs/superpowers/specs/2026-09-04-transcription-back-conversion-design.md`

## Global Constraints

- Type check with `npx tsc --noEmit`; run tests with `npx vitest run`; format with `npm run format`.
- Attribute keys are fixed by the wire protocol and must be used verbatim: `lk.segment_id`,
  `lk.transcribed_track_id`, `lk.transcription_final`, `lk.publish_on_behalf`. They are documented
  in `src/room/attribute-typings.ts` (a generated file — do not edit it).
- Reserved topic, verbatim: `lk.transcription`.
- `RoomEvent.TranscriptionReceived` keeps its exact existing signature:
  `(segments: TranscriptionSegment[], participant?: Participant, publication?: TrackPublication)`.
  Do not change it, and do not add a new room event.
- Managers take external state as constructor callbacks and never import `RTCEngine`
  (see "Manager pattern" in `CLAUDE.md`).
- `startTime`, `endTime` and `language` on synthesized segments stay `0n`, `0n` and `''` — exactly
  what agents write into legacy packets today.
- Every task ends with a commit.

---

### Task 1: Tap transcription streams with a manager event

Today a text stream is delivered to at most one consumer: the application handler registered for its
topic. The SDK needs to read `lk.transcription` itself **while still delivering it** to an
application handler for the same topic, because components-js reads that topic directly for
`lk.expression`.

So `IncomingDataStreamManager` becomes a typed event emitter (the manager pattern in `CLAUDE.md`)
and emits `transcriptionStreamArrived` whenever a text stream opens on the reserved transcription
topic. Internally the text path generalizes to N consumers, each with its own independent
`TextStreamReader`: the application handler, plus a synthetic consumer that feeds the event.

The event is named for the *stream* arriving, not a transcription: it fires when the stream opens,
before any text has been read, and deliberately avoids the legacy `transcriptionReceived` name.

Byte streams are deliberately left single-consumer — nothing internal reads them.

**Files:**
- Create: `src/room/data-stream/incoming/events.ts`
- Modify: `src/room/data-stream/constants.ts`
- Modify: `src/room/data-stream/incoming/IncomingDataStreamManager.ts`
- Test: `src/room/data-stream/incoming/IncomingDataStreamManager.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const TRANSCRIPTION_TOPIC = 'lk.transcription'` from `src/room/data-stream/constants.ts`
  - `export type EventTranscriptionStreamArrived = { reader: TextStreamReader; participantIdentity: string }`
  - `export type IncomingDataStreamManagerCallbacks = { transcriptionStreamArrived: (event: EventTranscriptionStreamArrived) => void }`
  - `IncomingDataStreamManager` extends `TypedEmitter<IncomingDataStreamManagerCallbacks>`, so
    `manager.on('transcriptionStreamArrived', handler)` is available.

- [ ] **Step 1: Write the failing tests**

Add these imports to `src/room/data-stream/incoming/IncomingDataStreamManager.test.ts`:

```typescript
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { TRANSCRIPTION_TOPIC } from '../constants';
import type { IncomingDataStreamManagerCallbacks } from './events';
```

Then add this block at the end of the top-level `describe('IncomingDataStreamManager', ...)`. The
helpers `headerPacket`, `chunkPacket` and `trailerPacket` already exist at the top of that file —
reuse them, do not redefine them. They send from `'alice'` and default to topic `'my-topic'`, which
the `fields` argument overrides.

```typescript
  describe('Transcription stream events', () => {
    it('should emit transcriptionStreamArrived alongside an application handler', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);
      const managerEvents = subscribeToEvents<IncomingDataStreamManagerCallbacks>(manager, [
        'transcriptionStreamArrived',
      ]);

      const appReaders: Array<TextStreamReader> = [];
      manager.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader) => appReaders.push(reader));

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          topic: TRANSCRIPTION_TOPIC,
          totalLength: BigInt(text.length),
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const event = await managerEvents.waitFor('transcriptionStreamArrived');
      expect(event.participantIdentity).toBe('alice');
      await expect(event.reader.readAll()).resolves.toBe(text);

      // The application handler for the same topic got its own independent reader.
      expect(appReaders).toHaveLength(1);
      await expect(appReaders[0].readAll()).resolves.toBe(text);
    });

    it('should emit transcriptionStreamArrived with no application handler registered', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);
      const managerEvents = subscribeToEvents<IncomingDataStreamManagerCallbacks>(manager, [
        'transcriptionStreamArrived',
      ]);

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          topic: TRANSCRIPTION_TOPIC,
          totalLength: BigInt(text.length),
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const event = await managerEvents.waitFor('transcriptionStreamArrived');
      await expect(event.reader.readAll()).resolves.toBe(text);
    });

    it('should emit transcriptionStreamArrived for an inline single-packet stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);
      const managerEvents = subscribeToEvents<IncomingDataStreamManagerCallbacks>(manager, [
        'transcriptionStreamArrived',
      ]);

      const appReaders: Array<TextStreamReader> = [];
      manager.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader) => appReaders.push(reader));

      const text = 'inline hello';
      manager.handleDataStreamPacket(
        headerPacket(crypto.randomUUID(), 'textHeader', {
          topic: TRANSCRIPTION_TOPIC,
          totalLength: BigInt(text.length),
          inlineContent: new TextEncoder().encode(text),
        }),
        Encryption_Type.NONE,
      );

      const event = await managerEvents.waitFor('transcriptionStreamArrived');
      await expect(event.reader.readAll()).resolves.toBe(text);
      await expect(appReaders[0].readAll()).resolves.toBe(text);
    });

    it('should surface trailer attributes to every consumer', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);
      const managerEvents = subscribeToEvents<IncomingDataStreamManagerCallbacks>(manager, [
        'transcriptionStreamArrived',
      ]);

      const appReaders: Array<TextStreamReader> = [];
      manager.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader) => appReaders.push(reader));

      const streamId = crypto.randomUUID();
      const text = 'hi';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          topic: TRANSCRIPTION_TOPIC,
          totalLength: BigInt(text.length),
          attributes: { 'lk.transcription_final': 'false' },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        trailerPacket(streamId, { 'lk.transcription_final': 'true' }),
        Encryption_Type.NONE,
      );

      const event = await managerEvents.waitFor('transcriptionStreamArrived');
      await event.reader.readAll();
      await appReaders[0].readAll();
      // Both readers share one `info`, so the trailer's finality flip reaches both.
      expect(event.reader.info.attributes?.['lk.transcription_final']).toBe('true');
      expect(appReaders[0].info.attributes?.['lk.transcription_final']).toBe('true');
    });

    it('should not emit transcriptionStreamArrived for any other topic', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);
      const managerEvents = subscribeToEvents<IncomingDataStreamManagerCallbacks>(manager, [
        'transcriptionStreamArrived',
      ]);

      const appReaders: Array<TextStreamReader> = [];
      manager.registerTextStreamHandler('my-topic', (reader) => appReaders.push(reader));

      const streamId = crypto.randomUUID();
      const text = 'hi';
      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', { totalLength: BigInt(text.length) }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      await expect(appReaders[0].readAll()).resolves.toBe(text);
      expect(managerEvents.areThereBufferedEvents('transcriptionStreamArrived')).toBe(false);
    });

    it('should still ignore a transcription stream when nothing is listening', () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const streamId = crypto.randomUUID();
      const header = headerPacket(streamId, 'textHeader', {
        topic: TRANSCRIPTION_TOPIC,
        totalLength: 2n,
      });

      expect(() => manager.handleDataStreamPacket(header, Encryption_Type.NONE)).not.toThrow();
      // No controller was registered, so re-using the stream id is not an "already in progress"
      // conflict - which proves the stream really was dropped rather than half-opened.
      expect(() => manager.handleDataStreamPacket(header, Encryption_Type.NONE)).not.toThrow();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/room/data-stream/incoming/IncomingDataStreamManager.test.ts -t "Transcription stream events"`
Expected: FAIL — cannot resolve `./events`, and `manager.on` does not exist.

- [ ] **Step 3: Add the topic constant and the event types**

Append to `src/room/data-stream/constants.ts`:

```typescript
/**
 * Reserved topic carrying transcription text streams. `IncomingDataStreamManager` taps this topic
 * with its `transcriptionStreamArrived` event so the SDK can rebuild transcription events while
 * still delivering the stream to any application handler.
 *
 * @internal
 */
export const TRANSCRIPTION_TOPIC = 'lk.transcription';
```

Create `src/room/data-stream/incoming/events.ts`:

```typescript
import type { TextStreamReader } from './StreamReader';

export type EventTranscriptionStreamArrived = {
  /**
   * An independent reader over the transcription stream. Reading it does not consume the stream
   * for any other consumer - an application handler registered on the same topic gets its own.
   */
  reader: TextStreamReader;
  /**
   * The stream's sender. Transcriptions are published on behalf of the *transcribed* participant,
   * so this is the speaker rather than the agent that produced the transcription.
   */
  participantIdentity: string;
};

export type IncomingDataStreamManagerCallbacks = {
  /**
   * A text stream opened on the reserved transcription topic. Emitted when the stream *starts*,
   * before any text has been read - the payload carries a reader, not a finished transcription.
   */
  transcriptionStreamArrived: (event: EventTranscriptionStreamArrived) => void;
};
```

- [ ] **Step 4: Make the manager a typed event emitter**

In `src/room/data-stream/incoming/IncomingDataStreamManager.ts`, add the imports:

```typescript
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { DEFAULT_MAX_PAYLOAD_BYTE_LENGTH, TRANSCRIPTION_TOPIC } from '../constants';
import type { IncomingDataStreamManagerCallbacks } from './events';
```

(the existing `DEFAULT_MAX_PAYLOAD_BYTE_LENGTH` import from `'../constants'` is replaced by the
combined one above)

Change the class declaration and add a `super()` call to the constructor:

```typescript
export default class IncomingDataStreamManager extends (EventEmitter as new () => TypedEmitter<IncomingDataStreamManagerCallbacks>) {
```

```typescript
  constructor(maxPayloadByteLength: number = DEFAULT_MAX_PAYLOAD_BYTE_LENGTH) {
    super();
    this.maxPayloadByteLength = maxPayloadByteLength;
  }
```

- [ ] **Step 5: Change `textStreamControllers` to hold a list per stream id**

Change the declaration (currently around line 36) from a single controller to an array:

```typescript
  private textStreamControllers = new Map<string, Array<StreamController<DataStream_Chunk>>>();
```

Update `validateParticipantHasNoActiveDataStreams` — replace the
`textStreamsBeingSentByDisconnectingParticipant` declaration:

```typescript
    const textStreamsBeingSentByDisconnectingParticipant = Array.from(
      this.textStreamControllers.entries(),
    ).filter(([, controllers]) =>
      controllers.some(
        (controller) => controller.sendingParticipantIdentity === participantIdentity,
      ),
    );
```

and the text half of the error loop:

```typescript
      for (const [id, controllers] of textStreamsBeingSentByDisconnectingParticipant) {
        for (const { controller } of controllers) {
          controller.error(abnormalEndError);
        }
        this.textStreamControllers.delete(id);
      }
```

- [ ] **Step 6: Fan out in the text branch of `handleStreamHeader`**

In the `case 'textHeader':` branch, replace the single-callback lookup:

```typescript
        const streamHandlerCallback = this.textStreamHandlers.get(streamHeader.topic);
        if (!streamHandlerCallback) {
          this.log.debug(
            'ignoring incoming text stream due to no handler for topic',
            streamHeader.topic,
          );
          return;
        }

        let streamController: ReadableStreamDefaultController<DataStream_Chunk>;
```

with:

```typescript
        // The transcription tap runs alongside the application handler, each with its own reader,
        // so the SDK can rebuild transcription events without taking the reserved topic away from
        // an application that reads it too. `listenerCount` keeps the "nobody wants this stream,
        // drop it" behavior intact when no one has subscribed.
        const streamHandlerCallbacks: Array<TextStreamHandler> = [];
        if (
          streamHeader.topic === TRANSCRIPTION_TOPIC &&
          this.listenerCount('transcriptionStreamArrived') > 0
        ) {
          streamHandlerCallbacks.push((reader, { identity }) => {
            this.emit('transcriptionStreamArrived', { reader, participantIdentity: identity });
          });
        }
        const applicationCallback = this.textStreamHandlers.get(streamHeader.topic);
        if (applicationCallback) {
          streamHandlerCallbacks.push(applicationCallback);
        }
        if (streamHandlerCallbacks.length === 0) {
          this.log.debug(
            'ignoring incoming text stream due to no handler for topic',
            streamHeader.topic,
          );
          return;
        }
```

Then replace the inline (single-packet) delivery block with:

```typescript
        const inlineContent = streamHeader.inlineContent as NonSharedUint8Array;
        if (typeof inlineContent !== 'undefined') {
          // Inline text is the raw UTF-8 payload, optionally deflate-raw compressed. `content` is
          // computed once and shared: when compressed it is a promise, so each inline stream awaits
          // the same decompression rather than repeating it.
          const content = compressed
            ? deflateRawDecompress(inlineContent, this.maxPayloadByteLength)
            : inlineContent;
          for (const streamHandlerCallback of streamHandlerCallbacks) {
            streamHandlerCallback(
              new TextStreamReader(
                info,
                createInlineStream(streamHeader.streamId, content),
                bigIntToNumber(streamHeader.totalLength),
              ),
              { identity: participantIdentity },
            );
          }
          return;
        }
```

Finally replace the chunked stream construction and delivery with:

```typescript
        if (this.textStreamControllers.has(streamHeader.streamId)) {
          throw new DataStreamError(
            `A data stream read is already in progress for a stream with id ${streamHeader.streamId}.`,
            DataStreamErrorReason.AlreadyOpened,
          );
        }

        const controllers: Array<StreamController<DataStream_Chunk>> = [];
        this.textStreamControllers.set(streamHeader.streamId, controllers);

        for (const streamHandlerCallback of streamHandlerCallbacks) {
          const stream = new ReadableStream<DataStream_Chunk>({
            start: (controller) => {
              controllers.push({
                info,
                controller,
                startTime: Date.now(),
                sendingParticipantIdentity: participantIdentity,
              });
            },
          });
          streamHandlerCallback(
            new TextStreamReader(
              info,
              compressed
                ? inflateRawChunkStream(stream, streamHeader.streamId, this.maxPayloadByteLength)
                : stream.pipeThrough(ensureOrderedChunks(streamHeader.streamId)),
              // `totalLength` is the pre-compression size, and the reader sees decompressed bytes,
              // so it applies to both paths.
              bigIntToNumber(streamHeader.totalLength),
            ),
            { identity: participantIdentity },
          );
        }
        return;
```

Two notes on this rewrite:

- The duplicate-stream-id check moves out of the `ReadableStream` `start` callback to before any
  consumer is built. The existing test
  `'should reject a duplicate TEXT streamId whose stream is already open'` still passes: the throw
  is still synchronous, and no second reader is created.
- All consumers share one `info` object by design, so a trailer's attribute merge is visible to
  every reader. That is how `lk.transcription_final` reaches them.

- [ ] **Step 7: Fan out chunk delivery**

In `handleStreamChunk`, replace the text half:

```typescript
    const textBuffers = this.textStreamControllers.get(chunk.streamId);
    if (textBuffers && textBuffers.length > 0) {
      // Every consumer of a stream shares one `info`, so one encryption check covers them all.
      const [{ info: textInfo }] = textBuffers;
      if (textInfo.encryptionType !== encryptionType) {
        const error = new DataStreamError(
          `Encryption type mismatch for stream ${chunk.streamId}. Expected ${encryptionType}, got ${textInfo.encryptionType}`,
          DataStreamErrorReason.EncryptionTypeMismatch,
        );
        for (const { controller } of textBuffers) {
          controller.error(error);
        }
        this.textStreamControllers.delete(chunk.streamId);
      } else {
        for (const { controller } of textBuffers) {
          controller.enqueue(chunk);
        }
      }
    }
```

- [ ] **Step 8: Fan out trailer delivery**

In `handleStreamTrailer`, replace the text half:

```typescript
    const textBuffers = this.textStreamControllers.get(trailer.streamId);
    if (textBuffers && textBuffers.length > 0) {
      const [{ info: textInfo }] = textBuffers;
      if (textInfo.encryptionType !== encryptionType) {
        const error = new DataStreamError(
          `Encryption type mismatch for stream ${trailer.streamId}. Expected ${encryptionType}, got ${textInfo.encryptionType}`,
          DataStreamErrorReason.EncryptionTypeMismatch,
        );
        for (const { controller } of textBuffers) {
          controller.error(error);
        }
      } else {
        // Shared `info`, so this merge is visible to every consumer's reader.
        textInfo.attributes = { ...textInfo.attributes, ...trailer.attributes };
        if (trailer.reason) {
          // A non-empty reason marks an abnormal close by the sender (e.g. an aborted send);
          // surface it as an error rather than pretending the stream completed.
          const error = new DataStreamError(
            `Data stream ${trailer.streamId} closed abnormally: ${trailer.reason}`,
            DataStreamErrorReason.AbnormalEnd,
          );
          for (const { controller } of textBuffers) {
            controller.error(error);
          }
        } else {
          for (const { controller } of textBuffers) {
            controller.close();
          }
        }
      }
      this.textStreamControllers.delete(trailer.streamId);
    }
```

- [ ] **Step 9: Run the full data stream suite**

Run: `npx vitest run src/room/data-stream/incoming/IncomingDataStreamManager.test.ts`
Expected: PASS — the six new tests plus every pre-existing test in the file.

- [ ] **Step 10: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
npm run format
git add src/room/data-stream/constants.ts src/room/data-stream/incoming/events.ts src/room/data-stream/incoming/IncomingDataStreamManager.ts src/room/data-stream/incoming/IncomingDataStreamManager.test.ts
git commit -m "feat(data-streams): emit transcriptionStreamArrived for lk.transcription streams"
```

---

### Task 2: `TranscriptionStreamConverter` — accumulation, replace and finality

The converter turns a sequence of `lk.transcription` text streams into synthesized `Transcription`
protobuf messages. It is pure: no `Room`, no `RTCEngine`, all outside state injected as callbacks.

Two stream shapes must be handled, and they differ:

- **Delta streams** (agent speech): one stream per segment, each chunk is an *increment*. The
  closing trailer carries `lk.transcription_final: 'true'`.
- **Non-delta streams** (user speech-to-text): one *fresh stream per update*, all sharing a single
  `lk.segment_id`, each carrying the **full** text. Finality is on the header — `'false'` for
  interim updates, `'true'` for the last one.

So `lk.transcription_final` is trusted whenever present, and stream close only implies finality when
the attribute is absent entirely. Treating every close as final (as the Swift SDK does) would
wrongly mark each interim user transcript final.

**Files:**
- Create: `src/room/transcription/TranscriptionStreamConverter.ts`
- Test: `src/room/transcription/TranscriptionStreamConverter.test.ts`

**Interfaces:**
- Consumes: `TextStreamReader` from `src/room/data-stream/incoming/StreamReader`.
- Produces:
  - `export default class TranscriptionStreamConverter`
  - `new TranscriptionStreamConverter(options: TranscriptionStreamConverterOptions)`
  - `export interface TranscriptionStreamConverterOptions { onTranscription: (transcription: Transcription) => void }`
    (extended with two more callbacks in Task 3)
  - `converter.handleTextStream(reader: TextStreamReader, senderIdentity: string): Promise<void>`
  - `converter.reset(): void`

- [ ] **Step 1: Write the failing tests**

Create `src/room/transcription/TranscriptionStreamConverter.test.ts`:

```typescript
import { DataStream_Chunk, Encryption_Type, type Transcription } from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { TextStreamReader } from '../data-stream/incoming/StreamReader';
import type { TextStreamInfo } from '../types';
import TranscriptionStreamConverter from './TranscriptionStreamConverter';

/** Lets pending microtasks (the reader's async iteration) run to completion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Builds a `TextStreamReader` fed by an explicit controller, so a test can interleave writes,
 * assertions, and a close that merges trailer attributes the way the real manager does.
 */
function transcriptionStream(id: string, attributes: Record<string, string> = {}) {
  const info: TextStreamInfo = {
    id,
    mimeType: 'text/plain',
    topic: 'lk.transcription',
    timestamp: 0,
    attributes,
    encryptionType: Encryption_Type.NONE,
  };
  let controller!: ReadableStreamDefaultController<DataStream_Chunk>;
  const stream = new ReadableStream<DataStream_Chunk>({
    start: (c) => {
      controller = c;
    },
  });
  let chunkIndex = 0;
  return {
    reader: new TextStreamReader(info, stream),
    write(text: string) {
      controller.enqueue(
        new DataStream_Chunk({
          streamId: id,
          chunkIndex: BigInt(chunkIndex++),
          content: new TextEncoder().encode(text),
        }),
      );
    },
    close(closeAttributes?: Record<string, string>) {
      if (closeAttributes) {
        info.attributes = { ...info.attributes, ...closeAttributes };
      }
      controller.close();
    },
  };
}

/** Flattens emitted `Transcription`s to `[text, final]` pairs for terse assertions. */
function emissions(emitted: Array<Transcription>) {
  return emitted.map((t) => [t.segments[0].text, t.segments[0].final]);
}

function setup() {
  const emitted: Array<Transcription> = [];
  const converter = new TranscriptionStreamConverter({
    onTranscription: (transcription) => emitted.push(transcription),
  });
  return { converter, emitted };
}

describe('TranscriptionStreamConverter', () => {
  it('appends deltas within one stream and marks final on the closing attribute', async () => {
    const { converter, emitted } = setup();
    const stream = transcriptionStream('ST_1', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });

    const done = converter.handleTextStream(stream.reader, 'agent-1');
    stream.write('Hello');
    await flush();
    stream.write(' world');
    await flush();
    stream.close({ 'lk.transcription_final': 'true' });
    await done;

    expect(emissions(emitted)).toEqual([
      ['Hello', false],
      ['Hello world', false],
      ['Hello world', true],
    ]);
    expect(emitted[0].segments[0].id).toBe('SG_1');
  });

  it('replaces the text when a new stream re-uses a segment id', async () => {
    const { converter, emitted } = setup();

    const interim = transcriptionStream('ST_1', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });
    const interimDone = converter.handleTextStream(interim.reader, 'user-1');
    interim.write('Hello');
    await flush();
    interim.close();
    await interimDone;

    const final = transcriptionStream('ST_2', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'true',
    });
    const finalDone = converter.handleTextStream(final.reader, 'user-1');
    final.write('Hello world!');
    await flush();
    final.close();
    await finalDone;

    // Not 'HelloHello world!' - the second stream replaces rather than appends.
    expect(emissions(emitted)).toEqual([
      ['Hello', false],
      ['Hello world!', true],
    ]);
    expect(emitted.every((t) => t.segments[0].id === 'SG_1')).toBe(true);
  });

  it('does not re-emit on close when the attribute already matched the last emission', async () => {
    const { converter, emitted } = setup();
    const stream = transcriptionStream('ST_1', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });

    const done = converter.handleTextStream(stream.reader, 'user-1');
    stream.write('Hello');
    await flush();
    stream.close();
    await done;

    expect(emissions(emitted)).toEqual([['Hello', false]]);
  });

  it('treats a close with no finality attribute as final', async () => {
    const { converter, emitted } = setup();
    const stream = transcriptionStream('ST_1', { 'lk.segment_id': 'SG_1' });

    const done = converter.handleTextStream(stream.reader, 'agent-1');
    stream.write('Hello');
    await flush();
    stream.close();
    await done;

    expect(emissions(emitted)).toEqual([
      ['Hello', false],
      ['Hello', true],
    ]);
  });

  it('accepts every form of the finality attribute agents send', async () => {
    for (const raw of ['true', '1']) {
      const { converter, emitted } = setup();
      const stream = transcriptionStream('ST_1', {
        'lk.segment_id': 'SG_1',
        'lk.transcription_final': raw,
      });
      const done = converter.handleTextStream(stream.reader, 'agent-1');
      stream.write('Hello');
      await flush();
      stream.close();
      await done;
      expect(emissions(emitted)).toEqual([['Hello', true]]);
    }
  });

  it('falls back to the stream id when lk.segment_id is absent', async () => {
    const { converter, emitted } = setup();
    const stream = transcriptionStream('ST_1');

    const done = converter.handleTextStream(stream.reader, 'agent-1');
    stream.write('Hello');
    await flush();
    stream.close();
    await done;

    expect(emitted[0].segments[0].id).toBe('ST_1');
  });

  it('keys partial state per sender so two speakers do not interleave', async () => {
    const { converter, emitted } = setup();
    const alice = transcriptionStream('ST_A', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });
    const bob = transcriptionStream('ST_B', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });

    const aliceDone = converter.handleTextStream(alice.reader, 'alice');
    const bobDone = converter.handleTextStream(bob.reader, 'bob');
    alice.write('from alice');
    bob.write('from bob');
    await flush();
    alice.close({ 'lk.transcription_final': 'true' });
    bob.close({ 'lk.transcription_final': 'true' });
    await Promise.all([aliceDone, bobDone]);

    const byIdentity = emitted.reduce<Record<string, Array<string>>>((acc, t) => {
      const identity = t.transcribedParticipantIdentity;
      acc[identity] = [...(acc[identity] ?? []), t.segments[0].text];
      return acc;
    }, {});
    expect(byIdentity.alice).toEqual(['from alice', 'from alice']);
    expect(byIdentity.bob).toEqual(['from bob', 'from bob']);
  });

  it('emits nothing for a stream that closes without any content', async () => {
    const { converter, emitted } = setup();
    const stream = transcriptionStream('ST_1', { 'lk.segment_id': 'SG_1' });

    const done = converter.handleTextStream(stream.reader, 'agent-1');
    stream.close();
    await done;

    expect(emitted).toHaveLength(0);
  });

  it('closes a segment out as final when the stream errors mid-segment', async () => {
    const { converter, emitted } = setup();
    const info: TextStreamInfo = {
      id: 'ST_1',
      mimeType: 'text/plain',
      topic: 'lk.transcription',
      timestamp: 0,
      attributes: { 'lk.segment_id': 'SG_1', 'lk.transcription_final': 'false' },
      encryptionType: Encryption_Type.NONE,
    };
    let controller!: ReadableStreamDefaultController<DataStream_Chunk>;
    const stream = new ReadableStream<DataStream_Chunk>({
      start: (c) => {
        controller = c;
      },
    });

    const done = converter.handleTextStream(new TextStreamReader(info, stream), 'agent-1');
    controller.enqueue(
      new DataStream_Chunk({
        streamId: 'ST_1',
        chunkIndex: 0n,
        content: new TextEncoder().encode('Hel'),
      }),
    );
    await flush();
    controller.error(new Error('sender disconnected'));
    await done;

    expect(emissions(emitted)).toEqual([
      ['Hel', false],
      ['Hel', true],
    ]);
  });

  it('drops in-flight segment state on reset', async () => {
    const { converter, emitted } = setup();
    const first = transcriptionStream('ST_1', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });
    const firstDone = converter.handleTextStream(first.reader, 'agent-1');
    first.write('Hello');
    await flush();
    first.close();
    await firstDone;

    converter.reset();

    const second = transcriptionStream('ST_2', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'false',
    });
    const secondDone = converter.handleTextStream(second.reader, 'agent-1');
    second.write('Fresh');
    await flush();
    second.close();
    await secondDone;

    expect(emissions(emitted)).toEqual([
      ['Hello', false],
      ['Fresh', false],
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts`
Expected: FAIL — cannot resolve `./TranscriptionStreamConverter`

- [ ] **Step 3: Write the converter**

Create `src/room/transcription/TranscriptionStreamConverter.ts`:

```typescript
import { Transcription, TranscriptionSegment as TranscriptionSegmentModel } from '@livekit/protocol';
import log from '../../logger';
import type { TextStreamReader } from '../data-stream/incoming/StreamReader';

/**
 * Attribute keys carried on `lk.transcription` stream headers and trailers. Declared in
 * `src/room/attribute-typings.ts` (generated), repeated here as the literals the wire uses.
 */
const SEGMENT_ID_ATTRIBUTE = 'lk.segment_id';
const TRANSCRIBED_TRACK_ID_ATTRIBUTE = 'lk.transcribed_track_id';
const TRANSCRIPTION_FINAL_ATTRIBUTE = 'lk.transcription_final';

export interface TranscriptionStreamConverterOptions {
  /** Invoked with a synthesized `Transcription` for every transcription update. */
  onTranscription: (transcription: Transcription) => void;
}

interface PartialTranscription {
  /** The stream this text came from; a different stream id for the same segment replaces it. */
  streamId: string;
  text: string;
  /** Last values handed to `onTranscription`, used to avoid emitting an identical update twice. */
  emittedText?: string;
  emittedFinal?: boolean;
}

/**
 * Rebuilds legacy-shaped `Transcription` messages from `lk.transcription` text streams, so
 * transcription events keep flowing once agents stop publishing the legacy `Transcription` data
 * packet (client protocol 3).
 *
 * Two stream shapes arrive on this topic and they accumulate differently:
 *
 * - **Delta** (agent speech): one stream per segment, each chunk an increment, finality on the
 *   closing trailer.
 * - **Non-delta** (user speech-to-text): a fresh stream per update, all sharing one
 *   `lk.segment_id`, each carrying the full text, finality on the header.
 *
 * So a new stream id for a segment already in flight *replaces* the accumulated text, and
 * `lk.transcription_final` is trusted whenever present - a stream close only implies finality when
 * the attribute is missing entirely. Treating every close as final would wrongly finalize each
 * interim user transcript.
 */
export default class TranscriptionStreamConverter {
  private log = log;

  private options: TranscriptionStreamConverterOptions;

  /** In-flight segments, keyed by `partialKey(senderIdentity, segmentId)`. */
  private partials = new Map<string, PartialTranscription>();

  constructor(options: TranscriptionStreamConverterOptions) {
    this.options = options;
  }

  /** Drops all in-flight segment state. */
  reset() {
    this.partials.clear();
  }

  handleTextStream = async (reader: TextStreamReader, senderIdentity: string) => {
    const segmentId = reader.info.attributes?.[SEGMENT_ID_ATTRIBUTE] || reader.info.id;
    const key = partialKey(senderIdentity, segmentId);

    const existing = this.partials.get(key);
    if (!existing || existing.streamId !== reader.info.id) {
      this.partials.set(key, { streamId: reader.info.id, text: '' });
    }

    try {
      for await (const chunk of reader) {
        const partial = this.partials.get(key);
        if (!partial || partial.streamId !== reader.info.id) {
          // A newer stream for this segment took over while this one was still draining.
          return;
        }
        partial.text += chunk;
        this.emitSegment(partial, segmentId, senderIdentity, reader, this.isFinal(reader) ?? false);
      }
    } catch (err) {
      // The stream ended abnormally (sender disconnected mid-segment, decode failure). Whatever
      // was accumulated is all there will ever be, so close the segment out.
      this.log.debug('lk.transcription stream ended abnormally', err);
      this.closeSegment(key, segmentId, senderIdentity, reader, true);
      return;
    }

    this.closeSegment(key, segmentId, senderIdentity, reader, this.isFinal(reader) ?? true);
  };

  private closeSegment(
    key: string,
    segmentId: string,
    senderIdentity: string,
    reader: TextStreamReader,
    final: boolean,
  ) {
    const partial = this.partials.get(key);
    if (!partial || partial.streamId !== reader.info.id) {
      return;
    }
    this.emitSegment(partial, segmentId, senderIdentity, reader, final);
    if (final) {
      this.partials.delete(key);
    }
  }

  private emitSegment(
    partial: PartialTranscription,
    segmentId: string,
    senderIdentity: string,
    reader: TextStreamReader,
    final: boolean,
  ) {
    if (partial.emittedText === undefined && partial.text === '') {
      // A stream that carried no content at all - nothing worth surfacing.
      return;
    }
    if (partial.emittedText === partial.text && partial.emittedFinal === final) {
      // Nothing changed since the last emission (e.g. a non-delta stream closing with the same
      // finality its header already declared).
      return;
    }
    partial.emittedText = partial.text;
    partial.emittedFinal = final;

    this.options.onTranscription(
      new Transcription({
        transcribedParticipantIdentity: senderIdentity,
        trackId: reader.info.attributes?.[TRANSCRIBED_TRACK_ID_ATTRIBUTE] ?? '',
        segments: [
          new TranscriptionSegmentModel({
            id: segmentId,
            text: partial.text,
            // Agents write zeroes and an empty language into legacy packets, so nothing is lost.
            startTime: 0n,
            endTime: 0n,
            final,
            language: '',
          }),
        ],
      }),
    );
  }

  /** `undefined` when the sender declared no finality at all. */
  private isFinal(reader: TextStreamReader): boolean | undefined {
    const raw = reader.info.attributes?.[TRANSCRIPTION_FINAL_ATTRIBUTE];
    if (raw === undefined) {
      return undefined;
    }
    // Agents send the string form even though the generated attribute typing calls it a boolean.
    return raw === 'true' || raw === '1' || (raw as unknown) === true;
  }
}

function partialKey(senderIdentity: string, segmentId: string) {
  return `${senderIdentity}/${segmentId}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts`
Expected: PASS — all 10 tests.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/room/transcription/TranscriptionStreamConverter.ts src/room/transcription/TranscriptionStreamConverter.test.ts
git commit -m "feat(transcription): add TranscriptionStreamConverter for lk.transcription streams"
```

---

### Task 3: Speaker and track sid resolution

Two gaps remain between a synthesized transcription and what the legacy channel produced, and both
break track-bound consumers (`useTrackTranscription`, `useVoiceAssistant`) if left alone:

1. `lk.transcribed_track_id` is **absent** whenever the agent's own `find_micro_track_id` lookup
   failed — notably an agent using an avatar, which publishes no microphone track itself. With no
   sid, `Room.handleTranscription` resolves no publication and `TrackEvent.TranscriptionReceived`
   never fires.
2. In avatar sessions the legacy channel named the **avatar worker** as the transcribed participant
   (it published `_represented_by`), while a stream's sender identity is the **agent**. The worker is
   the participant that actually publishes the audio track, so preferring it both matches legacy and
   makes the publication lookup succeed.

Both are resolved through injected callbacks so the converter stays free of `Room`.

**Files:**
- Modify: `src/room/transcription/TranscriptionStreamConverter.ts`
- Test: `src/room/transcription/TranscriptionStreamConverter.test.ts`

**Interfaces:**
- Consumes: `TranscriptionStreamConverterOptions` from Task 2.
- Produces: two additional required members on `TranscriptionStreamConverterOptions` —
  `getMicrophoneTrackSid: (identity: string) => string | undefined` and
  `getDelegatingPublisherIdentity: (identity: string) => string | undefined` — plus
  `export const PUBLISH_ON_BEHALF_ATTRIBUTE = 'lk.publish_on_behalf'`.

- [ ] **Step 1: Write the failing tests**

In `src/room/transcription/TranscriptionStreamConverter.test.ts`, replace the existing `setup`
helper with one that accepts resolver overrides:

```typescript
function setup(
  overrides: {
    getMicrophoneTrackSid?: (identity: string) => string | undefined;
    getDelegatingPublisherIdentity?: (identity: string) => string | undefined;
  } = {},
) {
  const emitted: Array<Transcription> = [];
  const converter = new TranscriptionStreamConverter({
    onTranscription: (transcription) => emitted.push(transcription),
    getMicrophoneTrackSid: overrides.getMicrophoneTrackSid ?? (() => undefined),
    getDelegatingPublisherIdentity: overrides.getDelegatingPublisherIdentity ?? (() => undefined),
  });
  return { converter, emitted };
}
```

Then append this block inside `describe('TranscriptionStreamConverter', ...)`:

```typescript
  describe('speaker and track resolution', () => {
    /** Drives one complete single-chunk segment and returns the last emission. */
    async function emitOne(
      converter: TranscriptionStreamConverter,
      emitted: Array<Transcription>,
      senderIdentity: string,
      attributes: Record<string, string>,
    ) {
      const stream = transcriptionStream('ST_1', attributes);
      const done = converter.handleTextStream(stream.reader, senderIdentity);
      stream.write('Hello');
      await flush();
      stream.close({ 'lk.transcription_final': 'true' });
      await done;
      return emitted[emitted.length - 1];
    }

    it('prefers the lk.transcribed_track_id attribute', async () => {
      const { converter, emitted } = setup({
        getMicrophoneTrackSid: () => 'TR_fallback',
      });
      const transcription = await emitOne(converter, emitted, 'agent-1', {
        'lk.segment_id': 'SG_1',
        'lk.transcribed_track_id': 'TR_attribute',
      });
      expect(transcription.trackId).toBe('TR_attribute');
      expect(transcription.transcribedParticipantIdentity).toBe('agent-1');
    });

    it("falls back to the speaker's microphone track when the attribute is absent", async () => {
      const { converter, emitted } = setup({
        getMicrophoneTrackSid: (identity) => (identity === 'user-1' ? 'TR_mic' : undefined),
      });
      const transcription = await emitOne(converter, emitted, 'user-1', {
        'lk.segment_id': 'SG_1',
      });
      expect(transcription.trackId).toBe('TR_mic');
    });

    it('attributes an avatar-delegated stream to the delegating publisher and its track', async () => {
      const { converter, emitted } = setup({
        getDelegatingPublisherIdentity: (identity) =>
          identity === 'agent-1' ? 'avatar-worker' : undefined,
        getMicrophoneTrackSid: (identity) =>
          identity === 'avatar-worker' ? 'TR_avatar' : undefined,
      });
      const transcription = await emitOne(converter, emitted, 'agent-1', {
        'lk.segment_id': 'SG_1',
      });
      // Legacy named the avatar worker, and it is the participant publishing the audio track.
      expect(transcription.transcribedParticipantIdentity).toBe('avatar-worker');
      expect(transcription.trackId).toBe('TR_avatar');
    });

    it("falls back to the sender's own microphone track when the delegate has none", async () => {
      const { converter, emitted } = setup({
        getDelegatingPublisherIdentity: () => 'avatar-worker',
        getMicrophoneTrackSid: (identity) => (identity === 'agent-1' ? 'TR_agent' : undefined),
      });
      const transcription = await emitOne(converter, emitted, 'agent-1', {
        'lk.segment_id': 'SG_1',
      });
      expect(transcription.trackId).toBe('TR_agent');
    });

    it('leaves trackId empty when nothing resolves', async () => {
      const { converter, emitted } = setup();
      const transcription = await emitOne(converter, emitted, 'agent-1', {
        'lk.segment_id': 'SG_1',
      });
      expect(transcription.trackId).toBe('');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts -t "speaker and track resolution"`
Expected: FAIL — `transcribedParticipantIdentity` is `'agent-1'` instead of `'avatar-worker'`, and
`trackId` is `''` instead of the resolved sid. TypeScript also reports the new `setup` overrides as
unknown options.

- [ ] **Step 3: Extend the options interface**

In `src/room/transcription/TranscriptionStreamConverter.ts`, add the attribute constant next to the
others:

```typescript
/** Set on a participant that publishes on another participant's behalf (e.g. an avatar worker). */
export const PUBLISH_ON_BEHALF_ATTRIBUTE = 'lk.publish_on_behalf';
```

and extend the options:

```typescript
export interface TranscriptionStreamConverterOptions {
  /** Invoked with a synthesized `Transcription` for every transcription update. */
  onTranscription: (transcription: Transcription) => void;
  /** Resolves the sid of the microphone track published by `identity`, if it has one. */
  getMicrophoneTrackSid: (identity: string) => string | undefined;
  /**
   * Resolves the identity of a participant whose `lk.publish_on_behalf` attribute names
   * `identity` - an avatar worker speaking for an agent, if one is present.
   */
  getDelegatingPublisherIdentity: (identity: string) => string | undefined;
}
```

- [ ] **Step 4: Resolve speaker and track in `emitSegment`**

Add the resolver method to the class:

```typescript
  /**
   * Works out which participant and track a transcription should be attributed to, matching what
   * the legacy channel reported.
   *
   * In an avatar session the legacy channel named the *delegating publisher* (the avatar worker)
   * rather than the agent it speaks for, and the stream's `lk.transcribed_track_id` is absent
   * because the agent publishes no microphone track of its own. Preferring the worker keeps the
   * identity stable across the cutover and lets `Room.handleTranscription` resolve a publication.
   */
  private resolveSpeaker(senderIdentity: string, reader: TextStreamReader) {
    const identity = this.options.getDelegatingPublisherIdentity(senderIdentity) ?? senderIdentity;
    const trackId =
      reader.info.attributes?.[TRANSCRIBED_TRACK_ID_ATTRIBUTE] ||
      this.options.getMicrophoneTrackSid(identity) ||
      this.options.getMicrophoneTrackSid(senderIdentity) ||
      '';
    return { identity, trackId };
  }
```

and use it in `emitSegment`, replacing the `this.options.onTranscription(...)` call:

```typescript
    const { identity, trackId } = this.resolveSpeaker(senderIdentity, reader);

    this.options.onTranscription(
      new Transcription({
        transcribedParticipantIdentity: identity,
        trackId,
        segments: [
          new TranscriptionSegmentModel({
            id: segmentId,
            text: partial.text,
            // Agents write zeroes and an empty language into legacy packets, so nothing is lost.
            startTime: 0n,
            endTime: 0n,
            final,
            language: '',
          }),
        ],
      }),
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts`
Expected: PASS — the 5 new resolution tests plus the 10 from Task 2.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/room/transcription/TranscriptionStreamConverter.ts src/room/transcription/TranscriptionStreamConverter.test.ts
git commit -m "feat(transcription): resolve speaker identity and track sid for stream transcriptions"
```

---

### Task 4: Unwrap `json_format` payloads

Agents configured with `json_format` publish each write as a JSON `TimedString`
(`{"text": "hi", "start_time": 1.5}` followed by a newline) instead of raw text, and there is **no
wire marker** distinguishing the two — no attribute, no distinct mime type. Without unwrapping, raw
JSON would land in `segment.text`.

**Deliberate narrowing from the spec:** the spec says timings may be populated from the
`TimedString` bounds. This task unwraps the **text only** and leaves `startTime`/`endTime` at `0n`.
The proto fields are `uint64` while `TimedString` carries floating-point values in an undocumented
unit, and legacy packets always carried `0`. Emitting a wrong unit is worse than emitting nothing;
populating them is a follow-up once the unit is pinned down.

**Files:**
- Modify: `src/room/transcription/TranscriptionStreamConverter.ts`
- Test: `src/room/transcription/TranscriptionStreamConverter.test.ts`

**Interfaces:**
- Consumes: the converter from Tasks 2-3.
- Produces: no new public surface — internal behavior change only.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('TranscriptionStreamConverter', ...)`:

```typescript
  describe('json_format payloads', () => {
    it('unwraps JSON TimedString chunks into plain text', async () => {
      const { converter, emitted } = setup();
      const stream = transcriptionStream('ST_1', {
        'lk.segment_id': 'SG_1',
        'lk.transcription_final': 'false',
      });

      const done = converter.handleTextStream(stream.reader, 'agent-1');
      stream.write('{"text": "Hello", "start_time": 1.5}\n');
      await flush();
      stream.write('{"text": " world", "start_time": 2.0}\n');
      await flush();
      stream.close({ 'lk.transcription_final': 'true' });
      await done;

      expect(emissions(emitted)).toEqual([
        ['Hello', false],
        ['Hello world', false],
        ['Hello world', true],
      ]);
      // Timings stay zeroed, exactly as the legacy channel always reported them.
      expect(emitted[0].segments[0].startTime).toBe(0n);
      expect(emitted[0].segments[0].endTime).toBe(0n);
    });

    it('leaves plain text chunks untouched, including ones that look JSON-ish', async () => {
      const { converter, emitted } = setup();
      const stream = transcriptionStream('ST_1', { 'lk.segment_id': 'SG_1' });

      const done = converter.handleTextStream(stream.reader, 'agent-1');
      stream.write('{not json at all');
      await flush();
      stream.write(' {"no_text_field": 1}');
      await flush();
      stream.close({ 'lk.transcription_final': 'true' });
      await done;

      expect(emitted[emitted.length - 1].segments[0].text).toBe(
        '{not json at all {"no_text_field": 1}',
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts -t "json_format payloads"`
Expected: FAIL — the first test sees the literal JSON text as the segment text.

- [ ] **Step 3: Add the unwrapper**

In `src/room/transcription/TranscriptionStreamConverter.ts`, add at the bottom of the file next to
`partialKey`:

```typescript
/**
 * Unwraps a chunk published by an agent running with `json_format`, which wraps every write as a
 * JSON `TimedString` (`{"text": "...", "start_time": 1.5}`) with a trailing newline.
 *
 * There is no wire marker for this mode - no attribute, no distinct mime type - so the payload has
 * to be sniffed. A transcript whose literal text happens to be a JSON object with a string `text`
 * field would be misread; that is accepted as vanishingly unlikely. The durable fix is a marker
 * attribute on the agent side.
 *
 * Only the text is taken. `TimedString` also carries `start_time`/`end_time` as floating point
 * values in an undocumented unit, while the proto segment fields are `uint64` - and the legacy
 * channel always reported zero - so the timings are deliberately dropped rather than guessed at.
 */
function unwrapTimedString(chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return chunk;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { text?: unknown }).text === 'string'
    ) {
      return (parsed as { text: string }).text;
    }
  } catch {
    // Not JSON after all - it is ordinary transcript text that happens to be brace-wrapped.
  }
  return chunk;
}
```

- [ ] **Step 4: Use it when accumulating**

In `handleTextStream`, change the accumulation line from `partial.text += chunk;` to:

```typescript
        partial.text += unwrapTimedString(chunk);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/room/transcription/TranscriptionStreamConverter.test.ts`
Expected: PASS — all 17 tests.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/room/transcription/TranscriptionStreamConverter.ts src/room/transcription/TranscriptionStreamConverter.test.ts
git commit -m "feat(transcription): unwrap json_format TimedString transcription payloads"
```

---

### Task 5: Wire the converter into `Room` and ignore legacy packets

This is the task that changes observable SDK behavior: transcription events start coming from
`lk.transcription` streams, and incoming legacy `Transcription` data packets stop producing events.

**Files:**
- Modify: `src/room/Room.ts` (field declaration and constructor near `:283`, `handleDataPacket`
  at `:2101`, `handleDisconnect` at `:1834`, new resolver methods after
  `registerRpcDataStreamHandler` at `:2589`)
- Test: `src/room/Room.test.ts`

**Interfaces:**
- Consumes: `TranscriptionStreamConverter` and `PUBLISH_ON_BEHALF_ATTRIBUTE` from Tasks 2-4; the
  `transcriptionStreamArrived` event on `IncomingDataStreamManager` from Task 1.
- Produces: no new exported surface — `Room` internals only.

- [ ] **Step 1: Write the failing tests**

Append to `src/room/Room.test.ts`. Add these to the existing `@livekit/protocol` import block at the
top of the file: `DataPacket`, `DataStream_Chunk`, `DataStream_Header`, `DataStream_TextHeader`,
`DataStream_Trailer`, `Encryption_Type`, `Transcription`, `TrackSource`, and
`TranscriptionSegment as TranscriptionSegmentModel`. Also add `TrackEvent` to the existing
`./events` import.

```typescript
describe('transcription back-conversion', () => {
  const agentIdentity = 'agent-1';
  const trackSid = 'TR_mic';

  /** A connected room with one remote participant publishing a microphone track. */
  function setupRoom() {
    const room = new Room();
    room.state = ConnectionState.Connected;
    (
      room as unknown as { incomingDataStreamManager: { setConnected: (c: boolean) => void } }
    ).incomingDataStreamManager.setConnected(true);

    const participant = new RemoteParticipant(room.engine.client, 'PA_agent', agentIdentity);
    const publication = new RemoteTrackPublication(
      Track.Kind.Audio,
      new TrackInfo({
        sid: trackSid,
        type: TrackType.AUDIO,
        name: 'roomio_audio',
        source: TrackSource.MICROPHONE,
      }),
      true,
    );
    participant.trackPublications.set(trackSid, publication);
    (
      room as unknown as { remoteParticipants: Map<string, RemoteParticipant> }
    ).remoteParticipants.set(agentIdentity, participant);

    return { room, participant, publication };
  }

  function pushPacket(room: Room, packet: DataPacket) {
    (
      room as unknown as {
        handleDataPacket: (packet: DataPacket, encryptionType: Encryption_Type) => void;
      }
    ).handleDataPacket(packet, Encryption_Type.NONE);
  }

  /** Publishes a complete single-chunk `lk.transcription` stream from `senderIdentity`. */
  function pushTranscriptionStream(
    room: Room,
    senderIdentity: string,
    text: string,
    attributes: Record<string, string>,
  ) {
    const streamId = crypto.randomUUID();
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamHeader',
          value: new DataStream_Header({
            streamId,
            topic: 'lk.transcription',
            mimeType: 'text/plain',
            timestamp: 0n,
            attributes,
            contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
          }),
        },
      }),
    );
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamChunk',
          value: new DataStream_Chunk({
            streamId,
            chunkIndex: 0n,
            content: new TextEncoder().encode(text),
          }),
        },
      }),
    );
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamTrailer',
          value: new DataStream_Trailer({ streamId }),
        },
      }),
    );
  }

  it('ignores legacy Transcription data packets', () => {
    const { room } = setupRoom();
    const received: Array<unknown> = [];
    room.on(RoomEvent.TranscriptionReceived, (segments) => received.push(segments));

    pushPacket(
      room,
      new DataPacket({
        participantIdentity: agentIdentity,
        value: {
          case: 'transcription',
          value: new Transcription({
            transcribedParticipantIdentity: agentIdentity,
            trackId: trackSid,
            segments: [
              new TranscriptionSegmentModel({ id: 'SG_legacy', text: 'legacy', final: true }),
            ],
          }),
        },
      }),
    );

    expect(received).toHaveLength(0);
  });

  it('emits TranscriptionReceived from an lk.transcription stream', async () => {
    const { room, participant, publication } = setupRoom();
    const roomEvents: Array<{ segments: Array<{ text: string }>; identity?: string }> = [];
    const trackEvents: Array<Array<{ text: string }>> = [];
    room.on(RoomEvent.TranscriptionReceived, (segments, p) =>
      roomEvents.push({ segments, identity: p?.identity }),
    );
    publication.on(TrackEvent.TranscriptionReceived, (segments) => trackEvents.push(segments));

    pushTranscriptionStream(room, agentIdentity, 'Hello world', {
      'lk.segment_id': 'SG_1',
      'lk.transcribed_track_id': trackSid,
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(roomEvents.length).toBeGreaterThan(0);
    expect(roomEvents[0].segments[0].text).toBe('Hello world');
    expect(roomEvents[0].identity).toBe(participant.identity);
    expect(trackEvents.length).toBeGreaterThan(0);
    expect(trackEvents[0][0].text).toBe('Hello world');
  });

  it("resolves the publication from the speaker's mic track when the attribute is absent", async () => {
    const { room, publication } = setupRoom();
    const trackEvents: Array<Array<{ text: string }>> = [];
    publication.on(TrackEvent.TranscriptionReceived, (segments) => trackEvents.push(segments));

    pushTranscriptionStream(room, agentIdentity, 'No track attribute', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackEvents.length).toBeGreaterThan(0);
    expect(trackEvents[0][0].text).toBe('No track attribute');
  });

  it('still delivers lk.transcription to an application text stream handler', async () => {
    const { room } = setupRoom();
    const appTexts: Array<string> = [];
    room.registerTextStreamHandler('lk.transcription', async (reader) => {
      appTexts.push(await reader.readAll());
    });

    pushTranscriptionStream(room, agentIdentity, 'Hello world', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appTexts).toEqual(['Hello world']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/room/Room.test.ts -t "transcription back-conversion"`
Expected: FAIL — `'ignores legacy Transcription data packets'` receives one event, and the three
stream tests receive none.

- [ ] **Step 3: Declare, construct and subscribe the converter in `Room`**

Add the import to `src/room/Room.ts`:

```typescript
import TranscriptionStreamConverter, {
  PUBLISH_ON_BEHALF_ATTRIBUTE,
} from './transcription/TranscriptionStreamConverter';
```

Declare the field alongside the existing `private incomingDataStreamManager` declaration:

```typescript
  private transcriptionStreamConverter: TranscriptionStreamConverter;
```

In the constructor, immediately after the
`this.incomingDataStreamManager = new IncomingDataStreamManager(...)` assignment (currently `:283`),
construct the converter and subscribe to the manager's tap. Subscribing here — rather than
registering a handler for the topic — is what leaves `lk.transcription` available to an application
that reads it directly, as components-js does for `lk.expression`:

```typescript
    this.transcriptionStreamConverter = new TranscriptionStreamConverter({
      onTranscription: (transcription) => this.handleTranscription(undefined, transcription),
      getMicrophoneTrackSid: this.getMicrophoneTrackSid,
      getDelegatingPublisherIdentity: this.getDelegatingPublisherIdentity,
    });
    this.incomingDataStreamManager.on(
      'transcriptionStreamArrived',
      ({ reader, participantIdentity }) => {
        this.transcriptionStreamConverter.handleTextStream(reader, participantIdentity);
      },
    );
```

- [ ] **Step 4: Add the resolver methods**

In `src/room/Room.ts`, immediately after the `registerRpcDataStreamHandler()` method:

```typescript
  private getMicrophoneTrackSid = (identity: Participant['identity']): string | undefined => {
    const participant = this.getParticipantByIdentity(identity);
    for (const publication of participant?.trackPublications.values() ?? []) {
      if (publication.source === Track.Source.Microphone) {
        return publication.trackSid;
      }
    }
    return undefined;
  };

  private getDelegatingPublisherIdentity = (
    identity: Participant['identity'],
  ): string | undefined => {
    // An avatar worker carries `lk.publish_on_behalf` naming the agent it speaks for.
    for (const participant of this.remoteParticipants.values()) {
      if (participant.attributes[PUBLISH_ON_BEHALF_ATTRIBUTE] === identity) {
        return participant.identity;
      }
    }
    return undefined;
  };
```

- [ ] **Step 5: Ignore legacy transcription packets**

In `handleDataPacket` (currently `:2101`), replace:

```typescript
    } else if (packet.value.case === 'transcription') {
      this.handleTranscription(participant, packet.value.value);
```

with:

```typescript
    } else if (packet.value.case === 'transcription') {
      // Legacy `Transcription` packets are ignored: transcription events are rebuilt from the
      // `lk.transcription` data stream channel instead, which this client advertises support for
      // via client protocol 3. See
      // docs/superpowers/specs/2026-09-04-transcription-back-conversion-design.md
      this.log.debug('ignoring legacy transcription data packet', this.logContext);
```

- [ ] **Step 6: Reset converter state on disconnect**

In `handleDisconnect` (currently `:1834`), add after `this.transcriptionReceivedTimes.clear();`:

```typescript
    this.transcriptionStreamConverter.reset();
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/room/Room.test.ts`
Expected: PASS — the four new tests plus every pre-existing test in the file.

- [ ] **Step 8: Run the whole suite and type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass. If any pre-existing test asserted that a legacy
`Transcription` packet produces events, update it to assert the new ignore behavior and say so in
the commit message.

- [ ] **Step 9: Commit**

```bash
npm run format
git add src/room/Room.ts src/room/Room.test.ts
git commit -m "feat(transcription): rebuild transcription events from lk.transcription streams"
```

---

### Task 6: Advertise client protocol 3

Advertising 3 is what tells agents they may stop publishing the legacy copy — the actual bandwidth
win. It lands last, after back-conversion is proven, because until then the SDK still needs agents
to behave exactly as they do today.

**Files:**
- Modify: `src/version.ts`
- Create: `src/version.test.ts`
- Create: `.changeset/transcription-back-conversion.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS = 3` from `src/version.ts`, and
  `clientProtocol` becomes `3`.

- [ ] **Step 1: Write the failing test**

Create `src/version.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS, clientProtocol } from './version';

describe('clientProtocol', () => {
  it('advertises transcription stream support', () => {
    // The advertised value is a wire contract: an agent seeing >= 3 may stop publishing legacy
    // `Transcription` packets, because this client rebuilds transcription events from
    // `lk.transcription` streams. Bump this deliberately, never incidentally.
    expect(CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS).toBe(3);
    expect(clientProtocol).toBe(CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/version.test.ts`
Expected: FAIL — `CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS` is not exported from `./version`.

- [ ] **Step 3: Add the constant and bump the advertised protocol**

In `src/version.ts`, add after `CLIENT_PROTOCOL_DATA_STREAM_V2`:

```typescript
/** The client rebuilds transcription events from `lk.transcription` text streams, so senders may
 * omit the legacy `Transcription` data packet. Read in both directions: a client advertising this
 * needs no legacy packets, and an agent advertising it publishes every transcription on the
 * `lk.transcription` stream channel. */
export const CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS = 3;
```

and change the advertised value:

```typescript
export const clientProtocol = CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/version.test.ts`
Expected: PASS

- [ ] **Step 5: Write the changeset**

Create `.changeset/transcription-back-conversion.md`:

```markdown
---
'livekit-client': minor
---

Rebuild transcription events from `lk.transcription` data streams and advertise client protocol 3

`RoomEvent.TranscriptionReceived` (and the matching `ParticipantEvent` / `TrackEvent`) are now
sourced from the `lk.transcription` text stream channel rather than legacy `Transcription` data
packets, which are ignored from this release on. The event signature is unchanged.

**This is a behavior change that takes effect immediately, not once agents adopt protocol 3.**
Agents currently publish both channels; this release reads the stream channel and drops the legacy
one. Advertising client protocol 3 additionally lets agents stop publishing the legacy copy
altogether, roughly halving reliable-channel traffic for transcriptions — a significant improvement
on constrained uplinks.

Applications reading `lk.transcription` directly via `registerTextStreamHandler` are unaffected: the
SDK observes the topic internally without taking it over. Any non-agent publisher of legacy
`Transcription` packets (a bespoke service calling `publish_transcription`, or a pre-1.0 agents
framework) no longer surfaces.
```

- [ ] **Step 6: Run the whole suite and type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/version.ts src/version.test.ts .changeset/transcription-back-conversion.md
git commit -m "feat: advertise client protocol 3 for transcription stream support"
```

---

## Post-implementation verification

Not a task — the manual end-to-end check from the spec, to run once all six tasks land.

- [ ] Extend `examples/data-stream-transcription-benchmark/` (or write a small harness) to publish
  `lk.transcription` streams carrying `lk.segment_id`, `lk.transcribed_track_id` and
  `lk.transcription_final`, in both shapes: delta (append, finality on the trailer) and non-delta
  (fresh stream per update sharing one segment id, finality on the header).
- [ ] Build the SDK and `pnpm link` it into `components-js`, then confirm `useTrackTranscription`
  and `useVoiceAssistant` render those transcriptions through the unmodified legacy events, and that
  `useTranscriptions` / `useAgentExpression` still receive the raw streams.
- [ ] Confirm against a live agent that transcripts appear exactly once, with no duplicated or
  dangling non-final segments across turn boundaries.
