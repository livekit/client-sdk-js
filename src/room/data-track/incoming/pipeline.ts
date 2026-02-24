import type { BaseE2EEManager } from '../../../e2ee/E2eeManager';
import { LoggerNames, getLogger } from '../../../logger';
import type { Throws } from '../../../utils/throws';
import DataTrackDepacketizer, { DataTrackDepacketizerDropError } from '../depacketizer';
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
  e2eeManager: BaseE2EEManager | null;
};

/**
 * Pipeline for an individual data track subscription.
 */
export default class IncomingDataTrackPipeline {
  private publisherIdentity: string;

  private e2eeManager: BaseE2EEManager | null;

  private depacketizer: DataTrackDepacketizer;

  /**
   * Creates a new pipeline with the given options.
   */
  constructor(options: Options) {
    const hasProvider = options.e2eeManager !== null;
    if (options.info.usesE2ee !== hasProvider) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        'IncomingDataTrackPipeline: DataTrackInfo.usesE2ee must match presence of decryptionProvider',
      );
    }

    const depacketizer = new DataTrackDepacketizer();

    this.publisherIdentity = options.publisherIdentity;
    this.e2eeManager = options.e2eeManager ?? null;
    this.depacketizer = depacketizer;
  }

  async processPacket(
    packet: DataTrackPacket,
  ): Promise<Throws<DataTrackFrame | null, DataTrackDepacketizerDropError>> {
    const frame = this.depacketize(packet);
    if (!frame) {
      return null;
    }

    const decrypted = await this.decryptIfNeeded(frame);
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
  private async decryptIfNeeded(frame: DataTrackFrame): Promise<DataTrackFrame | null> {
    const e2eeManager = this.e2eeManager;

    if (!e2eeManager) {
      return frame;
    }

    const e2ee = frame.extensions?.e2ee ?? null;
    if (!e2ee) {
      log.error('Missing E2EE meta');
      return null;
    }

    let result;
    try {
      result = await e2eeManager.handleEncryptedData(frame.payload, e2ee.iv, this.publisherIdentity, e2ee.keyIndex);
    } catch (err) {
      log.error(`Error decrypting packet: ${err}`);
      return null;
    }

    frame.payload = result.payload;
    return frame;
  }
}
