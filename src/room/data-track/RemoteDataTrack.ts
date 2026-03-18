import type Participant from '../participant/Participant';
import type { DataTrackFrame } from './frame';
import type IncomingDataTrackManager from './incoming/IncomingDataTrackManager';
import {
  DataTrackSymbol,
  type IDataTrack,
  type IRemoteTrack,
  TrackSymbol,
} from './track-interfaces';
import { type DataTrackInfo } from './types';

type RemoteDataTrackOptions = {
  publisherIdentity: Participant['identity'];
};

export type RemoteDataTrackSubscribeOptions = {
  signal?: AbortSignal;

  /** The number of {@link DataTrackFrame}s to hold in the ReadableStream before disgarding extra
   * frames. Defaults to 4, but this may not be good enough for especially high frequency data. */
  highWaterMark?: number;
};

export default class RemoteDataTrack implements IRemoteTrack, IDataTrack {
  readonly trackSymbol = TrackSymbol;

  readonly isLocal = false;

  readonly typeSymbol = DataTrackSymbol;

  info: DataTrackInfo;

  publisherIdentity: Participant['identity'];

  protected manager: IncomingDataTrackManager;

  /** @internal */
  constructor(
    info: DataTrackInfo,
    manager: IncomingDataTrackManager,
    options: RemoteDataTrackOptions,
  ) {
    this.info = info;
    this.manager = manager;
    this.publisherIdentity = options.publisherIdentity;
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
  async subscribe(
    options?: RemoteDataTrackSubscribeOptions,
  ): Promise<ReadableStream<DataTrackFrame>> {
    try {
      const stream = await this.manager.subscribeRequest(
        this.info.sid,
        options?.signal,
        options?.highWaterMark,
      );
      return stream;
    } catch (err) {
      // NOTE: Rethrow errors to break Throws<...> type boundary
      throw err;
    }
  }
}
