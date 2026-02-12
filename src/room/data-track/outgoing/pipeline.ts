import { type Throws } from '../../../utils/throws';
import { type EncryptedPayload, type EncryptionProvider } from '../e2ee';
import { type DataTrackFrame } from '../frame';
import { DataTrackPacket } from '../packet';
import { DataTrackE2eeExtension } from '../packet/extensions';
import DataTrackPacketizer, { DataTrackPacketizerError } from '../packetizer';
import type { DataTrackInfo } from '../types';
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
  ): Throws<Generator<DataTrackPacket>, DataTrackOutgoingPipelineError> {
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

// class CustomError extends Error {}

// // // This should fail, CustomError is being rejected, but isn't in the Throws type
// // async function failureExample(): Throws<Promise<void>, never> {
// //   return new Promise((resolve, reject) => {
// //     reject(new CustomError('custom error example'));
// //   });
// // }

// // This should succeed, because CustomError is in the Throws type.
// async function four(): Promise<Throws<void, CustomError>> {
//   return new Promise((resolve, reject) => {
//     reject(new CustomError('custom error example'));
//   });
// }

// // This should succeed, because the catch silences the error
// function five(): Promise<Throws<void, never>> {
//   return four().catch((err) => {
//     console.log('Logging and discarding error:', err);
//   });
// }

// // This should succeed, because the .then doesn't effect that four() throws an error.
// function six(): Promise<Throws<void, CustomError>> {
//   return four().then(() => {
//     console.log('Four has completed');
//   });
// }

// // class WrappedError extends Error {}

// // // This should succeed, because the catch converts err into WrappedError
// // function seven(): Promise<Throws<void, WrappedError>> {
// //   const result = four().then(() => 1);
// //   return result.catch((err) => {
// //     throw new WrappedError("wrapped", { cause: err });
// //   });
// // }
