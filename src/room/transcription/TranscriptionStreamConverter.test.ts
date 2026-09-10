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
});
