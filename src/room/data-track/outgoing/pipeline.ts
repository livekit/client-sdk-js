import type { BaseE2EEManager } from '../../../e2ee/E2eeManager';
import { type Throws } from '../../../utils/throws';
import { type DataTrackFrame } from '../frame';
import { DataTrackPacket } from '../packet';
import { DataTrackE2eeExtension } from '../packet/extensions';
import DataTrackPacketizer, { DataTrackPacketizerError } from '../packetizer';
import type { DataTrackInfo } from '../types';
import { DataTrackOutgoingPipelineError, DataTrackOutgoingPipelineErrorReason } from './errors';

type Options = {
  info: DataTrackInfo;
  e2eeManager: BaseE2EEManager | null;
};

/** Processes outgoing frames into final packets for distribution to the SFU. */
export default class DataTrackOutgoingPipeline {
  private e2eeManager: BaseE2EEManager | null;

  private packetizer: DataTrackPacketizer;

  /** Maximum transmission unit (MTU) of the transport. */
  private static TRANSPORT_MTU_BYTES = 16_000;

  constructor(options: Options) {
    this.e2eeManager = options.e2eeManager;
    this.packetizer = new DataTrackPacketizer(
      options.info.pubHandle,
      DataTrackOutgoingPipeline.TRANSPORT_MTU_BYTES,
    );
  }

  updateE2eeManager(e2eeManager: BaseE2EEManager | null) {
    this.e2eeManager = e2eeManager;
  }

  async *processFrame(
    frame: DataTrackFrame,
  ): Throws<AsyncGenerator<DataTrackPacket>, DataTrackOutgoingPipelineError> {
    const encryptedFrame = await this.encryptIfNeeded(frame);

    try {
      yield* this.packetizer.packetize(encryptedFrame);
    } catch (error) {
      if (error instanceof DataTrackPacketizerError) {
        throw DataTrackOutgoingPipelineError.packetizer(error);
      }
      throw error;
    }
  }

  async encryptIfNeeded(
    frame: DataTrackFrame,
  ): Promise<Throws<
    DataTrackFrame,
    DataTrackOutgoingPipelineError<DataTrackOutgoingPipelineErrorReason.Encryption>
  >> {
    if (!this.e2eeManager) {
      return frame;
    }

    let encryptedResult;
    try {
      encryptedResult = await this.e2eeManager.encryptData(frame.payload);
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
