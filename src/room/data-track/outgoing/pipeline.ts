import { type Throws } from '../../../utils/throws';
import { type EncryptedPayload, type EncryptionProvider } from '../e2ee';
import { type DataTrackFrame } from '../frame';
import { DataTrackPacket } from '../packet';
import { DataTrackE2eeExtension } from '../packet/extensions';
import DataTrackPacketizer, {
  DataTrackPacketizerError,
  DataTrackPacketizerReason,
} from '../packetizer';
import type { DataTrackInfo } from '../track';
import { DataTrackOutgoingPipelineError, DataTrackOutgoingPipelineErrorReason } from './errors';

type Options = {
  info: DataTrackInfo;
  encryptionProvider: EncryptionProvider | null;
};

/** Processes outgoing frames into final packets for distribution to the SFU. */
export default class DataTrackOutgoingPipeline {
  private encryptionProvider: EncryptionProvider | null;
  private packetizer: DataTrackPacketizer;

  /** Maximum transmission unit (MTU) of the transport. */
  private static TRANSPORT_MTU_BYTES = 16_000;

  constructor(options: Options) {
    this.encryptionProvider = options.encryptionProvider;
    this.packetizer = new DataTrackPacketizer(
      options.info.pubHandle,
      DataTrackOutgoingPipeline.TRANSPORT_MTU_BYTES,
    );
  }

  *processFrame(
    frame: DataTrackFrame,
  ): Throws<
    Generator<DataTrackPacket>,
    | DataTrackOutgoingPipelineError<DataTrackOutgoingPipelineErrorReason.Packetizer>
    | DataTrackOutgoingPipelineError<DataTrackOutgoingPipelineErrorReason.Encryption>
  > {
    const encryptedFrame = this.encryptIfNeeded(frame);

    try {
      yield* this.packetizer.packetize(encryptedFrame);
    } catch (error) {
      if (error instanceof DataTrackPacketizerError) {
        throw DataTrackOutgoingPipelineError.packetizer(error);
      }
      throw error;
    }
  }

  encryptIfNeeded(
    frame: DataTrackFrame,
  ): Throws<
    DataTrackFrame,
    DataTrackOutgoingPipelineError<DataTrackOutgoingPipelineErrorReason.Encryption>
  > {
    if (!this.encryptionProvider) {
      return frame;
    }

    let encryptedResult: EncryptedPayload;
    try {
      encryptedResult = this.encryptionProvider.encrypt(frame.payload);
    } catch (err) {
      throw DataTrackOutgoingPipelineError.encryption(err);
    }

    frame.payload = encryptedResult.payload;
    frame.extensions.e2ee = new DataTrackE2eeExtension(
      encryptedResult.keyIndex,
      encryptedResult.iv,
    );

    return frame;
  }
}
