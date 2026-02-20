import { LoggerNames, getLogger } from '../../../logger';
import type { Throws } from '../../../utils/throws';
import DataTrackDepacketizer, { DataTrackDepacketizerDropError } from '../depacketizer';
import type { DecryptionProvider, EncryptedPayload } from '../e2ee';
import type { DataTrackFrame } from '../frame';
import { DataTrackPacket } from '../packet';
import { type DataTrackInfo } from '../types';

const log = getLogger(LoggerNames.DataTracks);

/**
 * Options for creating a {@link IncomingDataTrackPipeline}.
 */
type Options = {
  info: DataTrackInfo;
  publisherIdentity: string;
  decryptionProvider: DecryptionProvider | null;
};

/**
 * Pipeline for an individual data track subscription.
 */
export default class IncomingDataTrackPipeline {
  private publisherIdentity: string;

  private e2eeProvider: DecryptionProvider | null;

  private depacketizer: DataTrackDepacketizer;

  /**
   * Creates a new pipeline with the given options.
   */
  constructor(options: Options) {
    const hasProvider = options.decryptionProvider !== null;
    if (options.info.usesE2ee !== hasProvider) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        'IncomingDataTrackPipeline: DataTrackInfo.usesE2ee must match presence of decryptionProvider',
      );
    }

    const depacketizer = new DataTrackDepacketizer();

    this.publisherIdentity = options.publisherIdentity;
    this.e2eeProvider = options.decryptionProvider ?? null;
    this.depacketizer = depacketizer;
  }

  processPacket(
    packet: DataTrackPacket,
  ): Throws<DataTrackFrame | null, DataTrackDepacketizerDropError> {
    const frame = this.depacketize(packet);
    if (!frame) {
      return null;
    }

    const decrypted = this.decryptIfNeeded(frame);
    if (!decrypted) {
      return null;
    }

    return decrypted;
  }

  /**
   * Depacketize the given frame, log if a drop occurs.
   */
  private depacketize(
    packet: DataTrackPacket,
  ): Throws<DataTrackFrame | null, DataTrackDepacketizerDropError> {
    let frame: DataTrackFrame | null;
    try {
      frame = this.depacketizer.push(packet);
    } catch (err) {
      // In a future version, use this to maintain drop statistics.
      // FIXME: is this a good idea?
      log.debug(`Data frame depacketize error: ${err}`);
      return null;
    }
    return frame;
  }

  /**
   * Decrypt the frame's payload if E2EE is enabled for this track.
   */
  private decryptIfNeeded(frame: DataTrackFrame): DataTrackFrame | null {
    const decryption = this.e2eeProvider;

    if (!decryption) {
      return frame;
    }

    const e2ee = frame.extensions?.e2ee ?? null;
    if (!e2ee) {
      log.error('Missing E2EE meta');
      return null;
    }

    const encrypted: EncryptedPayload = {
      payload: frame.payload,
      iv: e2ee.iv,
      keyIndex: e2ee.keyIndex,
    };

    let result: Uint8Array;
    try {
      result = decryption.decrypt(encrypted, this.publisherIdentity);
    } catch (err) {
      log.error(`Error decrypting packet: ${err}`);
      return null;
    }

    frame.payload = result;
    return frame;
  }
}
