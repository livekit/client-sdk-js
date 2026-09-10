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

    this.options.onTranscription(
      new Transcription({
        transcribedParticipantIdentity: senderIdentity,
        trackId: reader.info.attributes?.[ParticipantAgentAttributes.TranscribedTrackId] ?? '',
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
