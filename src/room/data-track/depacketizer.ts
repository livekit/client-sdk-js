import { LivekitReasonedError } from "../errors";
import { DataTrackFrame } from "./frame";
import { DataTrackPacket, FrameMarker } from "./packet";
import { DataTrackExtensions } from "./packet/extensions";
import { U16_MAX_SIZE, WrapAroundUnsignedInt } from "./utils";

type PartialFrame = {
  /** Frame number from the start packet. */
  frameNumber: number,
  /** Sequence of the start packet. */
  startSequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>,
  /** Extensions from the start packet. */
  extensions: DataTrackExtensions,
  /** Mapping between sequence number and packet payload. */
  payloads: Map<number, Uint8Array>,
  /** Sum of payload lengths. */
  payloadLenBytes: number,
};

/**
  * Result from a call to {@link Depacketizer.push}.
  * The reason this type is used instead of just a DepacketizerFrame is due to the fact a single
  * call to push can result in both a complete frame being delivered and a previous frame
  * being dropped.
*/
type DepacketizerPushResult = {
  frame: DataTrackFrame | null,
  dropError: DataTrackDepacketizerDropError | null,
};

/*8 An error indicating a frame was dropped. */
class DataTrackDepacketizerDropError extends LivekitReasonedError<DataTrackDepacketizerDropReason> {
  readonly name = 'DataTrackDepacketizerDropError';

  reason: DataTrackDepacketizerDropReason;
  reasonName: string;

  frameNumber: number;

  constructor(message: string, reason: DataTrackDepacketizerDropReason, frameNumber: number, options?: { cause?: unknown }) {
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

  static incomplete(frameNumber: number, receivedBytes: number, expectedBytes: number) {
    return new DataTrackDepacketizerDropError(
      `Not all packets received before final packet. Received ${receivedBytes} bytes, expected ${expectedBytes} bytes.`,
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

export class Depacketizer {
  /** Maximum number of packets to buffer per frame before dropping. */
  static MAX_BUFFER_PACKETS = 128;

  partial: PartialFrame | null = null;

  push(packet: DataTrackPacket) {
    switch (packet.header.marker) {
      case FrameMarker.Single:
        return this.frameFromSingle(packet);
      case FrameMarker.Start:
        return this.beginPartial(packet);
      case FrameMarker.Inter:
      case FrameMarker.Final:
        return this.pushToPartial(packet);
    }
  }

  reset() {
    this.partial = null;
  }

  private frameFromSingle(packet: DataTrackPacket): DepacketizerPushResult {
    if (packet.header.marker !== FrameMarker.Single) {
      throw new Error(`Depacketizer.frameFromSingle: packet.header.marker was not FrameMarker.Single, found ${packet.header.marker}.`);
    }

    const dropError = this.partial ? (
      DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber)
    ) : null;
    this.partial = null;

    const frame: DataTrackFrame = { payload: packet.payload, extensions: packet.header.extensions };

    return { frame, dropError };
  }

  /** Begin assembling a new packet. */
  private beginPartial(packet: DataTrackPacket): DepacketizerPushResult {
    if (packet.header.marker !== FrameMarker.Start) {
      throw new Error(`Depacketizer.beginPartial: packet.header.marker was not FrameMarker.Start, found ${packet.header.marker}.`);
    }

    const dropError = this.partial ? (
      DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber)
    ) : null;
    this.partial = null;

    const startSequence = packet.header.sequence;
    const payloadLenBytes = packet.payload.length;

    this.partial = {
      frameNumber: packet.header.frameNumber.value,
      startSequence,
      extensions: packet.header.extensions,
      payloads: new Map([[startSequence.value, packet.payload]]),
      payloadLenBytes,
    };

    return { frame: null, dropError };
  }

  /** Push to the existing partial frame. */
  private pushToPartial(packet: DataTrackPacket): DepacketizerPushResult {
    if (packet.header.marker !== FrameMarker.Inter && packet.header.marker !== FrameMarker.Final) {
      throw new Error(`Depacketizer.pushToPartial: packet.header.marker was not FrameMarker.Inter or FrameMarker.Final, found ${packet.header.marker}.`);
    }

    if (!this.partial) {
      throw DataTrackDepacketizerDropError.unknownFrame(packet.header.frameNumber.value);
    }

    if (packet.header.frameNumber.value !== this.partial.frameNumber) {
      throw DataTrackDepacketizerDropError.interrupted(this.partial.frameNumber);
    }
    if (this.partial.payloads.size == Depacketizer.MAX_BUFFER_PACKETS) {
      throw DataTrackDepacketizerDropError.bufferFull(this.partial.frameNumber);
    }
    this.partial.payloadLenBytes += packet.payload.length;
    this.partial.payloads.set(packet.header.sequence.value, packet.payload);

    if (packet.header.marker === FrameMarker.Final) {
      return this.finalize(this.partial, packet.header.sequence.value);
    }

    return { frame: null, dropError: null };
  }

  /** Try to reassemble the complete frame. */
  private finalize(partial: PartialFrame, endSequence: number): DepacketizerPushResult {
    const received = partial.payloads.size;
    const payload = new ArrayBuffer(partial.payloadLenBytes);

    let sequencePointer = partial.startSequence;
    let payloadOffsetPointerBytes = 0;
    while (true) {
      const partialPayload = partial.payloads.get(sequencePointer.value);
      if (!partialPayload) {
        break;
      }
      partial.payloads.delete(sequencePointer.value);

      const payloadRemainingBytes = payload.byteLength - payloadOffsetPointerBytes;
      if (payload.byteLength + partialPayload.length > payloadRemainingBytes) {
        throw new Error(`Depacketizer.finalize: Expected at least ${partialPayload.length} more bytes left in the payload buffer, only got ${payloadRemainingBytes} bytes.`);
      }

      partialPayload.set(partialPayload, payloadOffsetPointerBytes);
      payloadOffsetPointerBytes += partialPayload.length;

      if (sequencePointer.value < endSequence) {
        sequencePointer.add(1);
        continue;
      }

      return {
        frame: { payload, extensions: partial.extensions },
        dropError: null,
      };
    }

    return {
      frame: null,
      dropError: DataTrackDepacketizerDropError.incomplete(
        partial.frameNumber,
        received,
        endSequence - partial.startSequence.value + 1,
      ),
    };
  }
}
