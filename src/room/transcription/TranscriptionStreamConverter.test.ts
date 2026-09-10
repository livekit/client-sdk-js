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

    // Same stream id as the first stream, deliberately: replace-on-new-stream-id would produce
    // 'Fresh' on its own, so re-using 'ST_1' is what makes this assertion discriminate. Without
    // reset() the partial for (agent-1, SG_1) is still open on stream 'ST_1', so the write would
    // append and the text would be 'HelloFresh'.
    const second = transcriptionStream('ST_1', {
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
