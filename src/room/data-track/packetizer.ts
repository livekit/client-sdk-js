import type { Throws } from "../../utils/throws";
import { DataTrackHandle } from "./handle";
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from "./packet";
import { DataTrackExtensions } from "./packet/extensions";
import { DataTrackTimestamp, DataTrackClock, WrapAroundUnsignedInt } from "./utils";

export type PacketizerFrame = {
  payload: ArrayBuffer;
  extensions: DataTrackExtensions,
};

type PacketizeOptions = {
  now?: DataTrackTimestamp<90_000>;
};

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

  *packetize(frame: PacketizerFrame, options?: PacketizeOptions): Throws<Generator<DataTrackPacket>, never> {
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
