import { LoggerNames, getLogger } from '../../logger';
import { type Throws } from '../../utils/throws';
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
};

/** An error indicating a frame was dropped. */
export class DataTrackDepacketizerDropError<
  Reason extends DataTrackDepacketizerDropReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackDepacketizerDropError';

  reason: Reason;

  reasonName: string;

  frameNumber: number;

  constructor(message: string, reason: Reason, frameNumber: number, options?: { cause?: unknown }) {
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

  /** Should be repeatedly called with received {@link DataTrackPacket}s - intermediate calls
   * aggregate the packet's state internally, and return null.
   *
   * Once this method is called with the final packet to form a frame, a new {@link DataTrackFrame}
   * is returned.*/
  push(
    packet: DataTrackPacket,
    options?: PushOptions,
  ): Throws<
    DataTrackFrame | null,
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.BufferFull>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.UnknownFrame>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Incomplete>
  > {
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

  private frameFromSingle(
    packet: DataTrackPacket,
    options?: PushOptions,
  ): Throws<
    DataTrackFrame | null,
    DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>
  > {
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
  private beginPartial(
    packet: DataTrackPacket,
    options?: PushOptions,
  ): Throws<null, DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>> {
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

    this.partial = {
      frameNumber: packet.header.frameNumber.value,
      startSequence,
      extensions: packet.header.extensions,
      payloads: new Map([[startSequence.value, packet.payload]]),
    };

    return null;
  }

  /** Push to the existing partial frame. */
  private pushToPartial(
    packet: DataTrackPacket,
  ): Throws<
    DataTrackFrame | null,
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.UnknownFrame>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.BufferFull>
    | DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Incomplete>
  > {
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

    // NOTE: this check will block reprocessing packets with duplicate sequence values if the
    // buffer is full already, which could maybe be problematic for very large frames.
    if (this.partial.payloads.size >= DataTrackDepacketizer.MAX_BUFFER_PACKETS) {
      throw DataTrackDepacketizerDropError.bufferFull(this.partial.frameNumber);
    }

    // Note: receiving a packet with a duplicate `sequence` value is something that likely won't
    // happen in actual use, but even if it does (maybe a low level network retransmission?) the
    // last packet with a given sequence received should always win.
    if (this.partial.payloads.has(packet.header.sequence.value)) {
      log.warn(
        `Data track frame ${this.partial.frameNumber} received duplicate packet for sequence ${packet.header.sequence.value}, so replacing with newly received packet.`,
      );
    }
    this.partial.payloads.set(packet.header.sequence.value, packet.payload);

    if (packet.header.marker === FrameMarker.Final) {
      return this.finalize(this.partial, packet.header.sequence.value);
    }

    return null;
  }

  /** Try to reassemble the complete frame. */
  private finalize(
    partial: PartialFrame,
    endSequence: number,
  ): Throws<
    DataTrackFrame,
    DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Incomplete>
  > {
    const received = partial.payloads.size;

    let payloadLengthBytes = 0;
    for (const p of partial.payloads.values()) {
      payloadLengthBytes += p.length;
    }
    const payload = new Uint8Array(payloadLengthBytes);

    let sequencePointer = partial.startSequence.value;
    let payloadOffsetPointerBytes = 0;
    while (true) {
      const partialPayload = partial.payloads.get(sequencePointer);
      if (!partialPayload) {
        break;
      }
      partial.payloads.delete(sequencePointer);

      const payloadRemainingBytes = payload.length - payloadOffsetPointerBytes;
      if (partialPayload.length > payloadRemainingBytes) {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(
          `Depacketizer.finalize: Expected at least ${partialPayload.length} more bytes left in the payload buffer, only got ${payloadRemainingBytes} bytes.`,
        );
      }

      payload.set(partialPayload, payloadOffsetPointerBytes);
      payloadOffsetPointerBytes += partialPayload.length;

      if (sequencePointer < endSequence) {
        sequencePointer += 1;
        continue;
      }

      // The packet is done processing, reset the state so another frame can be processed next.
      this.reset();
      return { payload, extensions: partial.extensions };
    }

    this.reset();
    throw DataTrackDepacketizerDropError.incomplete(
      partial.frameNumber,
      received,
      endSequence - partial.startSequence.value + 1,
    );
  }
}
