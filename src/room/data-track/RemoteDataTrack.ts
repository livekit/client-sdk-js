import type { Throws } from '../../utils/throws';
import type Participant from '../participant/Participant';
import type { DataTrackFrame } from './frame';
import type IncomingDataTrackManager from './incoming/IncomingDataTrackManager';
import type { DataTrackSubscribeError } from './incoming/IncomingDataTrackManager';
import { type DataTrackInfo } from './types';

export default class RemoteDataTrack {
  info: DataTrackInfo;

  publisherIdentity: Participant['identity'];

  protected manager: IncomingDataTrackManager;

  // FIXME: rethink this signature, it will be hard to make backwards compatible updates
  constructor(
    info: DataTrackInfo,
    publisherIdentity: Participant['identity'],
    manager: IncomingDataTrackManager,
  ) {
    this.info = info;
    this.publisherIdentity = publisherIdentity;
    this.manager = manager;
  }

  /** Subscribes to the data track to receive frames.
   *
   * # Returns
   *
   * A stream that yields {@link DataTrackFrame}s as they arrive.
   *
   * # Multiple Subscriptions
   *
   * An application may call `subscribe` more than once to process frames in
   * multiple places. For example, one async task might plot values on a graph
   * while another writes them to a file.
   *
   * Internally, only the first call to `subscribe` communicates with the SFU and
   * allocates the resources required to receive frames. Additional subscriptions
   * reuse the same underlying pipeline and do not trigger additional signaling.
   *
   * Note that newly created subscriptions only receive frames published after
   * the initial subscription is established.
   */
  async subscribe(options?: {
    signal?: AbortSignal;
  }): Promise<Throws<ReadableStream<DataTrackFrame>, DataTrackSubscribeError>> {
    return this.manager.subscribeRequest(this.info.sid, options?.signal);
  }
}
