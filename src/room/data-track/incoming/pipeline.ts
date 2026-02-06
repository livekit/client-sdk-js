import { LivekitReasonedError } from '../../errors';
import { EncryptedPayload, type EncryptionProvider } from '../e2ee';
import type { DataTrackInfo } from '../track';
import DataTrackPacketizer, { DataTrackPacketizerError, DataTrackPacketizerReason } from '../packetizer';
import { DataTrackFrame } from '../frame';
import { Throws } from '../../../utils/throws';
import { DataTrackPacket } from '../packet';
import { DataTrackE2eeExtension } from '../packet/extensions';

enum DataTrackIncomingPipelineErrorReason {
  Packetizer = 0,
  Encryption = 1,
}

class DataTrackIncomingPipelineError<
  Reason extends DataTrackIncomingPipelineErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackIncomingPipelineError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackIncomingPipelineErrorReason[reason];
  }

  static packetizer(cause: DataTrackPacketizerError<DataTrackPacketizerReason>) {
    return new DataTrackIncomingPipelineError("Error packetizing frame", DataTrackIncomingPipelineErrorReason.Packetizer, { cause });
  }

  static encryption(cause: unknown) {
    return new DataTrackIncomingPipelineError("Error encrypting frame", DataTrackIncomingPipelineErrorReason.Encryption, { cause });
  }
}

type Options = {
  info: DataTrackInfo;
  encryptionProvider: EncryptionProvider | null;
};

export default class DataTrackIncomingPipeline {
  private encryptionProvider: EncryptionProvider | null;
  private packetizer: DataTrackPacketizer;

  /** Maximum transmission unit (MTU) of the transport. */
  private static TRANSPORT_MTU_BYTES = 16_000;

  constructor(options: Options) {
    this.encryptionProvider = options.encryptionProvider;
    this.packetizer = new DataTrackPacketizer(options.info.pubHandle, DataTrackIncomingPipeline.TRANSPORT_MTU_BYTES);
  }

  *processFrame(frame: DataTrackFrame): Throws<
    Generator<DataTrackPacket>,
    | DataTrackIncomingPipelineError<DataTrackIncomingPipelineErrorReason.Packetizer>
    | DataTrackIncomingPipelineError<DataTrackIncomingPipelineErrorReason.Encryption>
  > {
    let encryptedFrame = this.encryptIfNeeded(frame);

    try {
      yield* this.packetizer.packetize(encryptedFrame);
    } catch (error) {
      if (error instanceof DataTrackPacketizerError) {
        throw DataTrackIncomingPipelineError.packetizer(error);
      }
      throw error;
    }
  }

  encryptIfNeeded(frame: DataTrackFrame): Throws<DataTrackFrame, DataTrackIncomingPipelineError<DataTrackIncomingPipelineErrorReason.Encryption>> {
    if (!this.encryptionProvider) {
      return frame;
    }

    let encryptedResult: EncryptedPayload;
    try {
      encryptedResult = this.encryptionProvider.encrypt(frame.payload);
    } catch (err) {
      throw DataTrackIncomingPipelineError.encryption(err);
    }

    frame.payload = encryptedResult.payload;
    frame.extensions.e2ee = new DataTrackE2eeExtension(encryptedResult.keyIndex, encryptedResult.iv);

    return frame;
  }
}
