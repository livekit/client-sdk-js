import { type Throws } from '../../../utils/throws';
import { LivekitReasonedError } from '../../errors';
import { type EncryptedPayload, type EncryptionProvider } from '../e2ee';
import { type DataTrackFrame } from '../frame';
import { DataTrackPacket } from '../packet';
import { DataTrackE2eeExtension } from '../packet/extensions';
import DataTrackPacketizer, {
  DataTrackPacketizerError,
  DataTrackPacketizerReason,
} from '../packetizer';
import type { DataTrackInfo } from '../track';

enum DataTrackOutgoingPipelineErrorReason {
  Packetizer = 0,
  Encryption = 1,
}

class DataTrackOutgoingPipelineError<
  Reason extends DataTrackOutgoingPipelineErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackOutgoingPipelineError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackOutgoingPipelineErrorReason[reason];
  }

  static packetizer(cause: DataTrackPacketizerError<DataTrackPacketizerReason>) {
    return new DataTrackOutgoingPipelineError(
      'Error packetizing frame',
      DataTrackOutgoingPipelineErrorReason.Packetizer,
      { cause },
    );
  }

  static encryption(cause: unknown) {
    return new DataTrackOutgoingPipelineError(
      'Error encrypting frame',
      DataTrackOutgoingPipelineErrorReason.Encryption,
      { cause },
    );
  }
}

type Options = {
  info: DataTrackInfo;
  encryptionProvider: EncryptionProvider | null;
};

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
    let encryptedFrame = this.encryptIfNeeded(frame);

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
