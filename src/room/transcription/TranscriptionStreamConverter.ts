import {
  Transcription,
  TranscriptionSegment as TranscriptionSegmentModel,
} from '@livekit/protocol';
import log from '../../logger';
import type { TextStreamReader } from '../data-stream/incoming/StreamReader';
import { ParticipantAgentAttributes } from '../participant/attributes';

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
    const segmentId =
      reader.info.attributes?.[ParticipantAgentAttributes.TranscriptionSegmentId] || reader.info.id;
    const key = partialKey(senderIdentity, segmentId);

    const existing = this.partials.get(key);
    if (!existing || existing.streamId !== reader.info.id) {
      this.partials.set(key, { streamId: reader.info.id, text: '' });
    }

    // Chunk boundaries follow the transport's packet splitting, not the sender's writes, so
    // payload decoding has to carry state across chunks for the lifetime of this stream.
    const decoder = new TranscriptStreamDecoder();

    try {
      for await (const chunk of reader) {
        const partial = this.partials.get(key);
        if (!partial || partial.streamId !== reader.info.id) {
          // A newer stream for this segment took over while this one was still draining.
          return;
        }
        partial.text += decoder.push(chunk);
        this.emitSegment(partial, segmentId, senderIdentity, reader, this.isFinal(reader) ?? false);
      }
    } catch (err) {
      // The stream ended abnormally (sender disconnected mid-segment, decode failure). Whatever
      // was accumulated is all there will ever be, so close the segment out.
      this.log.debug('lk.transcription stream ended abnormally', err);
      this.closeSegment(key, segmentId, senderIdentity, reader, true, decoder.flush());
      return;
    }

    this.closeSegment(
      key,
      segmentId,
      senderIdentity,
      reader,
      this.isFinal(reader) ?? true,
      decoder.flush(),
    );
  };

  private closeSegment(
    key: string,
    segmentId: string,
    senderIdentity: string,
    reader: TextStreamReader,
    final: boolean,
    trailingText: string,
  ) {
    const partial = this.partials.get(key);
    if (!partial || partial.streamId !== reader.info.id) {
      return;
    }
    partial.text += trailingText;
    this.emitSegment(partial, segmentId, senderIdentity, reader, final);
    if (final) {
      this.partials.delete(key);
    }
  }

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
    // `||` rather than `??` throughout: a resolver that reports "nothing found" as an empty string
    // rather than undefined should fall through to the next candidate, not pin the result to ''.
    // An empty identity resolves no participant, and an empty track sid resolves no publication,
    // so treating either as a real answer silently stops the transcription events from firing.
    const identity = this.options.getDelegatingPublisherIdentity(senderIdentity) || senderIdentity;
    const trackId =
      reader.info.attributes?.[ParticipantAgentAttributes.TranscribedTrackId] ||
      this.options.getMicrophoneTrackSid(identity) ||
      this.options.getMicrophoneTrackSid(senderIdentity) ||
      '';
    return { identity, trackId };
  }

  private emitSegment(
    partial: PartialTranscription,
    segmentId: string,
    senderIdentity: string,
    reader: TextStreamReader,
    final: boolean,
  ) {
    if (typeof partial.emittedText === 'undefined' && partial.text === '') {
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
            startTime: BigInt(0),
            endTime: BigInt(0),
            final,
            language: '',
          }),
        ],
      }),
    );
  }

  /** `undefined` when the sender declared no finality at all. */
  private isFinal(reader: TextStreamReader): boolean | undefined {
    const raw = reader.info.attributes?.[ParticipantAgentAttributes.TranscriptionFinal];
    if (typeof raw === 'undefined') {
      return undefined;
    }
    // Agents send the string form even though the generated attribute typing calls it a boolean.
    return raw === 'true' || raw === '1' || (raw as unknown) === true;
  }
}

function partialKey(senderIdentity: string, segmentId: string) {
  return `${senderIdentity}/${segmentId}`;
}

/**
 * Decodes the chunks of a single `lk.transcription` stream into transcript text, unwrapping the
 * payloads of an agent running with `json_format`. That mode wraps every write as a JSON
 * `TimedString` (`{"text": "...", "start_time": 1.5}`) terminated by a newline.
 *
 * There is no wire marker for this mode - no attribute, no distinct mime type - so the stream's
 * first chunk is sniffed: one opening with `{"` puts the whole stream in JSON mode. A plain-text
 * transcript that happens to start that way still comes through intact, since lines that fail to
 * parse as a `TimedString` are passed through verbatim; it just isn't surfaced until each newline
 * (or the stream's close) arrives. The durable fix is a marker attribute on the agent side.
 *
 * A chunk is a transport packet, not a sender write: a `TimedString` larger than one packet arrives
 * split across chunks, and one chunk may hold several. So JSON mode buffers and only decodes
 * complete newline-terminated lines. Whatever is left unterminated when the stream closes (agents
 * write their final markup-stripped tail unencoded) is decoded by `flush`.
 *
 * Only the text is taken. `TimedString` also carries `start_time`/`end_time` as floating point
 * values in an undocumented unit, while the proto segment fields are `uint64` - and the legacy
 * channel always reported zero - so the timings are deliberately dropped rather than guessed at.
 */
class TranscriptStreamDecoder {
  private mode: 'pending' | 'text' | 'json' = 'pending';

  /** JSON mode only: the trailing, not yet newline-terminated part of the stream. */
  private buffered = '';

  /** Returns the transcript text the chunk completes, possibly empty. */
  push(chunk: string): string {
    if (this.mode === 'pending') {
      if (chunk.trim() === '') {
        return chunk;
      }
      this.mode = chunk.trim().startsWith('{"') ? 'json' : 'text';
    }
    if (this.mode === 'text') {
      return chunk;
    }

    this.buffered += chunk;
    const lines = this.buffered.split('\n');
    this.buffered = lines.pop() ?? '';
    return lines.map((line) => unwrapTimedString(line) ?? `${line}\n`).join('');
  }

  /** Returns any text still buffered at the end of the stream. */
  flush(): string {
    const rest = this.buffered;
    this.buffered = '';
    return rest === '' ? '' : (unwrapTimedString(rest) ?? rest);
  }
}

/** The `text` of a JSON `TimedString` line, or `undefined` if the line is not one. */
function unwrapTimedString(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return undefined;
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
  return undefined;
}
