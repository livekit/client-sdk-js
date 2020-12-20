import { LocalDataTrackOptions } from './options';
import { Track } from './Track';

export class LocalDataTrack extends Track {
  dataChannel?: RTCDataChannel;

  constructor(options?: LocalDataTrackOptions) {
    super(Track.Kind.Data, options?.name);
  }

  stop() {
    if (this.dataChannel) this.dataChannel.close();
  }
}
