import { LoggerNames, getLogger } from '../../logger';
import { LivekitReasonedError } from '../errors';
import { type DataTrackFrame } from './frame';
import { DataTrackPacket, FrameMarker } from './packet';
import { DataTrackExtensions } from './packet/extensions';
import { U16_MAX_SIZE, WrapAroundUnsignedInt } from './utils';

const log = getLogger(LoggerNames.DataTracks);

type PartialFrame = {
  /** Frame number from the start packet. */
  frameNumber: number;
  /** Sequence of the start packet. */
  startSequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
  /** Extensions from the start packet. */
  extensions: DataTrackExtensions;
  /** Mapping between sequence number and packet payload. */
  payloads: Map<number, Uint8Array>;
  /** Sum of payload lengths. */
  payloadLenBytes: number;
};

/** An error indicating a frame was dropped. */
export class DataTrackDepacketizerDropError extends LivekitReasonedError<DataTrackDepacketizerDropReason> {
  readonly name = 'DataTrackDepacketizerDropError';

  reason: DataTrackDepacketizerDropReason;

  reasonName: string;

  frameNumber: number;

  constructor(
    message: string,
    reason: DataTrackDepacketizerDropReason,
    frameNumber: number,
    options?: { cause?: unknown },
  ) {
    super(19, `Frame ${frameNumber} dropped: ${message}`, options);
    this.reason = reason;
    this.reasonName = DataTrackDepacketizerDropReason[reason];
    this.frameNumber = frameNumber;
  }

  static interrupted(frameNumber: number) {
    return new DataTrackDepacketizerDropError(
      'Interrupted by the start of a new frame',
      DataTrackDepacketizerDropReason.Interrupted,
      frameNumber,
    );
  }

  static unknownFrame(frameNumber: number) {
    return new DataTrackDepacketizerDropError(
      'Initial packet was never received.',
      DataTrackDepacketizerDropReason.UnknownFrame,
      frameNumber,
    );
  }

  static bufferFull(frameNumber: number) {
    return new DataTrackDepacketizerDropError(
      'Reorder buffer is full.',
      DataTrackDepacketizerDropReason.BufferFull,
      frameNumber,
    );
  }

  static incomplete(frameNumber: number, receivedPackets: number, expectedPackets: number) {
    return new DataTrackDepacketizerDropError(
      `Not all packets received before final packet. Received ${receivedPackets} packets, expected ${expectedPackets} packets.`,
      DataTrackDepacketizerDropReason.Incomplete,
      frameNumber,
    );
  }
}

/** Reason why a frame was dropped. */
export enum DataTrackDepacketizerDropReason {
  Interrupted = 0,
  UnknownFrame = 1,
  BufferFull = 2,
  Incomplete = 3,
}

type PushOptions = {
  /** If true, throws an error instead of logging a warning when a new frame is encountered half way
   * through processing a pre-existing frame. */
  errorOnPartialFrames: boolean;
};

export class DataTrackDepacketizer {
  /** Maximum number of packets to buffer per frame before dropping. */
  static MAX_BUFFER_PACKETS = 128;

  private partial: PartialFrame | null = null;

  push(packet: DataTrackPacket, options?: PushOptions): DataTrackFrame | null {
    switch (packet.header.marker) {
      case FrameMarker.Single:
        return this.frameFromSingle(packet, options);
      case FrameMarker.Start:
        return this.beginPartial(packet, options);
      case FrameMarker.Inter:
      case FrameMarker.Final:
        return this.pushToPartial(packet);
    }
  }

  reset() {
    this.partial = null;
  }

  private frameFromSingle(packet: DataTrackPacket, options?: PushOptions) {
    if (packet.header.marker !== FrameMarker.Single) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `Depacketizer.frameFromSingle: packet.header.marker was not FrameMarker.Single, found ${packet.header.marker}.`,
      );
    }

    if (this.partial) {
      if (options?.errorOnPartialFrames) {
        throw DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber);
      } else {
        log.warn(
          `Data track frame ${this.partial.frameNumber} was interrupted by the start of a new frame, dropping.`,
        );
      }
    }
    this.reset();

    return { payload: packet.payload, extensions: packet.header.extensions };
  }

  /** Begin assembling a new packet. */
  private beginPartial(packet: DataTrackPacket, options?: PushOptions) {
    if (packet.header.marker !== FrameMarker.Start) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `Depacketizer.beginPartial: packet.header.marker was not FrameMarker.Start, found ${packet.header.marker}.`,
      );
    }

    if (this.partial) {
      if (options?.errorOnPartialFrames) {
        throw DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber);
      } else {
        log.warn(
          `Data track frame ${this.partial.frameNumber} was interrupted by the start of a new frame, dropping.`,
        );
      }
    }
    this.reset();

    const startSequence = packet.header.sequence;
    const payloadLenBytes = packet.payload.length;

    this.partial = {
      frameNumber: packet.header.frameNumber.value,
      startSequence,
      extensions: packet.header.extensions,
      payloads: new Map([[startSequence.value, packet.payload]]),
      payloadLenBytes,
    };

    return null;
  }

  /** Push to the existing partial frame. */
  private pushToPartial(packet: DataTrackPacket) {
    if (packet.header.marker !== FrameMarker.Inter && packet.header.marker !== FrameMarker.Final) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `Depacketizer.pushToPartial: packet.header.marker was not FrameMarker.Inter or FrameMarker.Final, found ${packet.header.marker}.`,
      );
    }

    if (!this.partial) {
      throw DataTrackDepacketizerDropError.unknownFrame(packet.header.frameNumber.value);
    }

    if (packet.header.frameNumber.value !== this.partial.frameNumber) {
      throw DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber);
    }
    if (this.partial.payloads.size == DataTrackDepacketizer.MAX_BUFFER_PACKETS) {
      throw DataTrackDepacketizerDropError.bufferFull(this.partial.frameNumber);
    }
    this.partial.payloadLenBytes += packet.payload.length;
    this.partial.payloads.set(packet.header.sequence.value, packet.payload);

    if (packet.header.marker === FrameMarker.Final) {
      return this.finalize(this.partial, packet.header.sequence.value);
    }

    return null;
  }

  /** Try to reassemble the complete frame. */
  private finalize(partial: PartialFrame, endSequence: number) {
    const received = partial.payloads.size;
    const payload = new Uint8Array(partial.payloadLenBytes);

    let sequencePointer = partial.startSequence.clone();
    let payloadOffsetPointerBytes = 0;
    while (true) {
      const partialPayload = partial.payloads.get(sequencePointer.value);
      if (!partialPayload) {
        break;
      }
      partial.payloads.delete(sequencePointer.value);

      const payloadRemainingBytes = payload.length - payloadOffsetPointerBytes;
      if (partialPayload.length > payloadRemainingBytes) {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(
          `Depacketizer.finalize: Expected at least ${partialPayload.length} more bytes left in the payload buffer, only got ${payloadRemainingBytes} bytes.`,
        );
      }

      payload.set(partialPayload, payloadOffsetPointerBytes);
      payloadOffsetPointerBytes += partialPayload.length;

      if (sequencePointer.value < endSequence) {
        sequencePointer.increment(1);
        continue;
      }

      return { payload, extensions: partial.extensions };
    }

    throw DataTrackDepacketizerDropError.incomplete(
      partial.frameNumber,
      received,
      endSequence - partial.startSequence.value + 1,
    );
  }
}
