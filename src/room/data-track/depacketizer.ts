import { type Throws } from '@livekit/throws-transformer/throws';
import { LoggerNames, getLogger } from '../../logger';
import { LivekitReasonedError } from '../errors';
import { type DataTrackFrameInternal } from './frame';
import { DataTrackPacket, FrameMarker } from './packet';
import { DataTrackExtensions } from './packet/extensions';
import { U16_MAX_SIZE, WrapAroundUnsignedInt } from './utils';

const log = getLogger(LoggerNames.DataTracks);

type PartialFrame = {
  /** Sequence of the start packet. */
  startSequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
  /** Extensions from the start packet. */
  extensions: DataTrackExtensions;
  /** Mapping between sequence number and packet payload. */
  payloads: Map<number, Uint8Array>;
};

/** An error indicating a frame was dropped. */
export class DataTrackDepacketizerDropError<
  Reason extends DataTrackDepacketizerDropReason = DataTrackDepacketizerDropReason,
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

  static interrupted(frameNumber: number, newFrameNumber: number) {
    return new DataTrackDepacketizerDropError(
      `Interrupted by the start of a new frame ${newFrameNumber}`,
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

  maximumConcurrentPartialFrames?: number
};

export default class DataTrackDepacketizer {
  /** Maximum number of packets to buffer per frame before dropping. */
  static MAX_BUFFER_PACKETS = 128;

  private partials: Map<
    number, /* Frame number from the start packet. */
    { frame: PartialFrame, startedAt: Date }
  > = new Map();

  /** Should be repeatedly called with received {@link DataTrackPacket}s - intermediate calls
   * aggregate the packet's state internally, and return null.
   *
   * Once this method is called with the final packet to form a frame, a new {@link DataTrackFrameInternal}
   * is returned.*/
  push(
    packet: DataTrackPacket,
    options?: PushOptions,
  ): Throws<DataTrackFrameInternal | null, DataTrackDepacketizerDropError> {
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
    this.partials.clear();
  }

  private peekOldestPartialFrameNumber() {
    const orderedPartialEntries = Array.from(this.partials.entries()).sort((a, b) => {
      return a[1].startedAt.getTime() - b[1].startedAt.getTime()
    });
    if (orderedPartialEntries.length > 0) {
      return orderedPartialEntries[0][0];
    } else {
      return null;
    }
  }

  private frameFromSingle(packet: DataTrackPacket, options?: PushOptions): Throws<
    DataTrackFrameInternal | null,
    DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>
  > {
    if (packet.header.marker !== FrameMarker.Single) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `Depacketizer.frameFromSingle: packet.header.marker was not FrameMarker.Single, found ${packet.header.marker}.`,
      );
    }

    // const maximumConcurrentPartialFrames = options?.maximumConcurrentPartialFrames ?? 1;
    // if (this.partials.size < maximumConcurrentPartialFrames) {

    if (this.partials.size > 0 && options?.maximumConcurrentPartialFrames === 1) {
      const oldestPartialFrameNumber = this.peekOldestPartialFrameNumber();
      if (!oldestPartialFrameNumber) {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(
          `Depacketizer.frameFromSingle: no oldest frame number found, but partials.size is ${this.partials.size}`,
        );
      }

      if (options?.errorOnPartialFrames) {
        this.partials.delete(oldestPartialFrameNumber);
        throw DataTrackDepacketizerDropError.interrupted(
          oldestPartialFrameNumber,
          packet.header.frameNumber.value,
        );
      } else {
        log.warn(
          `Data track frame ${oldestPartialFrameNumber} was interrupted by the start of a new frame, dropping.`,
        );
      }
    }

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

    const startSequence = packet.header.sequence;
    const frameNumber = packet.header.frameNumber.value;
    const partial: PartialFrame = {
      startSequence,
      extensions: packet.header.extensions,
      payloads: new Map([[startSequence.value, packet.payload]]),
    };

    const maximumConcurrentPartialFrames = options?.maximumConcurrentPartialFrames ?? 1;
    if (this.partials.size >= maximumConcurrentPartialFrames) {
      const oldestPartialFrameNumber = this.peekOldestPartialFrameNumber()!;
      this.partials.delete(oldestPartialFrameNumber);

      if (options?.errorOnPartialFrames) {
        const oldestPartialFrameNumber = this.peekOldestPartialFrameNumber();
        if (!oldestPartialFrameNumber) {
          // @throws-transformer ignore - this should be treated as a "panic" and not be caught
          throw new Error(
            `Depacketizer.beginPartial: no oldest frame number found, but partials.size is ${this.partials.size}`,
          );
        }
        throw DataTrackDepacketizerDropError.interrupted(oldestPartialFrameNumber, frameNumber);
      } else {
        log.warn(
          `Data track partials (size of ${maximumConcurrentPartialFrames}) didn't have enough room for a new frame ${frameNumber}, dropping.`,
        );
      }
    }
    this.partials.set(frameNumber, { frame: partial, startedAt: new Date() });

    return null;
  }

  /** Push to the existing partial frame. */
  private pushToPartial(
    packet: DataTrackPacket,
  ): Throws<DataTrackFrameInternal | null, DataTrackDepacketizerDropError> {
    if (packet.header.marker !== FrameMarker.Inter && packet.header.marker !== FrameMarker.Final) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `Depacketizer.pushToPartial: packet.header.marker was not FrameMarker.Inter or FrameMarker.Final, found ${packet.header.marker}.`,
      );
    }

    const packetFrameNumber = packet.header.frameNumber.value;
    const matchingPartial = this.partials.get(packetFrameNumber);
    if (!matchingPartial) {
      this.partials.delete(packetFrameNumber);
      throw DataTrackDepacketizerDropError.unknownFrame(packet.header.frameNumber.value);
    }

    // NOTE: this check will block reprocessing packets with duplicate sequence values if the
    // buffer is full already, which could maybe be problematic for very large frames.
    if (matchingPartial.frame.payloads.size >= DataTrackDepacketizer.MAX_BUFFER_PACKETS) {
      this.partials.delete(packetFrameNumber);
      throw DataTrackDepacketizerDropError.bufferFull(packetFrameNumber);
    }

    // Note: receiving a packet with a duplicate `sequence` value is something that likely won't
    // happen in actual use, but even if it does (maybe a low level network retransmission?) the
    // last packet with a given sequence received should always win.
    if (matchingPartial.frame.payloads.has(packet.header.sequence.value)) {
      log.warn(
        `Data track frame ${packetFrameNumber} received duplicate packet for sequence ${packet.header.sequence.value}, so replacing with newly received packet.`,
      );
    }
    matchingPartial.frame.payloads.set(packet.header.sequence.value, packet.payload);

    if (packet.header.marker === FrameMarker.Final) {
      return this.finalize(packetFrameNumber, matchingPartial.frame, packet.header.sequence.value);
    }

    return null;
  }

  /** Try to reassemble the complete frame. */
  private finalize(
    partialFrameNumber: number,
    partial: PartialFrame,
    endSequence: number,
  ): Throws<
    DataTrackFrameInternal,
    DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Incomplete>
  > {
    const received = partial.payloads.size;

    let payloadLengthBytes = 0;
    for (const p of partial.payloads.values()) {
      payloadLengthBytes += p.length;
    }
    const payload = new Uint8Array(payloadLengthBytes);

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

      // NOTE: sequencePointer could wrap around, which is why this isn't a "<"
      if (sequencePointer.value != endSequence) {
        sequencePointer.increment();
        continue;
      }

      // The packet is done processing, reset the state so another frame can be processed next.
      this.partials.delete(partialFrameNumber);
      return { payload, extensions: partial.extensions };
    }

    this.partials.delete(partialFrameNumber);
    throw DataTrackDepacketizerDropError.incomplete(
      partialFrameNumber,
      received,
      endSequence - partial.startSequence.value + 1,
    );
  }
}
