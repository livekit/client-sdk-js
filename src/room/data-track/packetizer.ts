import type { Throws } from "../../utils/throws";
import { DataTrackHandle } from "./handle";
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from "./packet";
import { DataTrackExtensions } from "./packet/extensions";
import { DataTrackTimestamp, DataTrackClock, WrapAroundUnsignedInt } from "./utils";

/** A pair of payload bytes and packet extensions fed into a {@link DataTrackPacketizer}. */
export type DataTrackPacketizerFrame = {
  payload: ArrayBuffer;
  extensions: DataTrackExtensions,
};

type PacketizeOptions = {
  /** "now" timestamp to use as a base when generating new packet timestamps. If not specified,
    * defaults to the return value of {@link DataTrackClock#now}. */
  now?: DataTrackTimestamp<90_000>;
};

/** A packetizer takes a {@link DataTrackPacketizerFrame} as input and generates a series
  * of {@link DataTrackPacket}s for transmission to other clients over webrtc. */
export class DataTrackPacketizer {
  private handle: DataTrackHandle;
  private mtuSizeBytes: number;

  private sequence = WrapAroundUnsignedInt.u16(0);
  private frameNumber = WrapAroundUnsignedInt.u16(0);
  private clock = DataTrackClock.rtpStartingNow(DataTrackTimestamp.rtpRandom());

  constructor(trackHandle: DataTrackHandle, mtuSizeBytes: number) {
    this.handle = trackHandle;
    this.mtuSizeBytes = mtuSizeBytes;
  }

  private computeFrameMarker(index: number, packetCount: number) {
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
  *packetize(frame: DataTrackPacketizerFrame, options?: PacketizeOptions): Throws<Generator<DataTrackPacket>, never> {
    const frameNumber = this.frameNumber.getThenIncrement();
    const headerParams = {
      marker: FrameMarker.Inter,
      trackHandle: this.handle,
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber,
      timestamp: options?.now ?? this.clock.now(),
      extensions: frame.extensions,
    };
    const headerSerializedLengthBytes = new DataTrackPacketHeader(headerParams).toBinaryLengthBytes();
    if (headerSerializedLengthBytes > this.mtuSizeBytes) {
      throw new Error("PacketizerError::MtuTooShort");
    }

    const maxPayloadSizeBytes = this.mtuSizeBytes - headerSerializedLengthBytes;

    const packetCount = Math.ceil(frame.payload.byteLength / maxPayloadSizeBytes);

    for (let indexBytes = 0; indexBytes < frame.payload.byteLength; indexBytes += maxPayloadSizeBytes) {
      const sequence = this.sequence.getThenIncrement();
      const packetHeader = new DataTrackPacketHeader({
        ...headerParams,
        marker: this.computeFrameMarker(indexBytes, packetCount),
        sequence,
      });

      const packetPayloadLengthBytes = Math.min(
        // All but the last packet will be max length ...
        maxPayloadSizeBytes,
        // ... and the last packet will be as long as it needs to be to finish out the buffer.
        frame.payload.byteLength - indexBytes,
      );
      const packetPayload = new Uint8Array(frame.payload, indexBytes, packetPayloadLengthBytes);

      yield new DataTrackPacket(packetHeader, packetPayload);
    }
  }
}

// const packetizer = new DataTrackPacketizer(DataTrackHandle.fromNumber(1), 100);
// for (const packet of packetizer.packetize({
//   payload: new Uint8Array(300).fill(0xbe).buffer,
//   extensions: new DataTrackExtensions(),
// })) {
//   console.log('PACKET:', packet, packet.toBinary());
// }
