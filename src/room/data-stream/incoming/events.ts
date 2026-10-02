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
