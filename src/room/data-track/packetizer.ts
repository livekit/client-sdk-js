import type { Throws } from '../../utils/throws';
import { LivekitReasonedError } from '../errors';
import { type DataTrackFrame } from './frame';
import { DataTrackHandle } from './handle';
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from './packet';
import { DataTrackClock, DataTrackTimestamp, WrapAroundUnsignedInt } from './utils';

type PacketizeOptions = {
  /** "now" timestamp to use as a base when generating new packet timestamps. If not specified,
   * defaults to the return value of {@link DataTrackClock#now}. */
  now?: DataTrackTimestamp<90_000>;
};

export class DataTrackPacketizerError<
  Reason extends DataTrackPacketizerReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackPacketizerError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(19, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPacketizerReason[reason];
  }

  static mtuTooShort() {
    return new DataTrackPacketizerError(
      'MTU is too short to send frame',
      DataTrackPacketizerReason.MtuTooShort,
    );
  }
}

export enum DataTrackPacketizerReason {
  MtuTooShort = 0,
}

/** A packetizer takes a {@link DataTrackFrame} as input and generates a series
 * of {@link DataTrackPacket}s for transmission to other clients over webrtc. */
export default class DataTrackPacketizer {
  private handle: DataTrackHandle;

  private mtuSizeBytes: number;

  private sequence = WrapAroundUnsignedInt.u16(0);

  private frameNumber = WrapAroundUnsignedInt.u16(0);

  private clock = DataTrackClock.rtpStartingNow(DataTrackTimestamp.rtpRandom());

  constructor(trackHandle: DataTrackHandle, mtuSizeBytes: number) {
    this.handle = trackHandle;
    this.mtuSizeBytes = mtuSizeBytes;
  }

  /** @internal */
  static computeFrameMarker(index: number, packetCount: number) {
    if (packetCount <= 1) {
      return FrameMarker.Single;
    }
    if (index === 0) {
      return FrameMarker.Start;
    } else if (index === packetCount - 1) {
      return FrameMarker.Final;
    } else {
      return FrameMarker.Inter;
    }
  }

  /** Generates a series of packets for the specified {@link DataTrackPacketizerFrame}.
   *
   * NOTE: The return value of this function is a generator, so it can be lazily ran if desired,
   * or converted to an array with {@link Array.from}.
   */
  *packetize(
    frame: DataTrackFrame,
    options?: PacketizeOptions,
  ): Throws<
    Generator<DataTrackPacket>,
    DataTrackPacketizerError<DataTrackPacketizerReason.MtuTooShort>
  > {
    const frameNumber = this.frameNumber.getThenIncrement();
    const headerParams = {
      marker: FrameMarker.Inter,
      trackHandle: this.handle,
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber,
      timestamp: options?.now ?? this.clock.now(),
      extensions: frame.extensions,
    };
    const headerSerializedLengthBytes = new DataTrackPacketHeader(
      headerParams,
    ).toBinaryLengthBytes();
    if (headerSerializedLengthBytes >= this.mtuSizeBytes) {
      throw DataTrackPacketizerError.mtuTooShort();
    }

    const maxPayloadSizeBytes = this.mtuSizeBytes - headerSerializedLengthBytes;

    const packetCount = Math.ceil(frame.payload.byteLength / maxPayloadSizeBytes);

    for (
      let index = 0, indexBytes = 0;
      indexBytes < frame.payload.byteLength;
      [index, indexBytes] = [index + 1, indexBytes + maxPayloadSizeBytes]
    ) {
      const sequence = this.sequence.getThenIncrement();
      const packetHeader = new DataTrackPacketHeader({
        ...headerParams,
        marker: DataTrackPacketizer.computeFrameMarker(index, packetCount),
        sequence,
      });

      const packetPayloadLengthBytes = Math.min(
        // All but the last packet will be max length ...
        maxPayloadSizeBytes,
        // ... and the last packet will be as long as it needs to be to finish out the buffer.
        frame.payload.byteLength - indexBytes,
      );
      const packetPayload = new Uint8Array(
        frame.payload.buffer,
        frame.payload.byteOffset + indexBytes,
        packetPayloadLengthBytes,
      );

      yield new DataTrackPacket(packetHeader, packetPayload);
    }
  }
}
