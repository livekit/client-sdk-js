import { LocalDataTrackOptions } from './options';
import { Track } from './Track';

export class LocalDataTrack extends Track {
  dataChannel?: RTCDataChannel;
  readonly dataChannelInit: RTCDataChannelInit;

  constructor(options?: LocalDataTrackOptions) {
    super(Track.Kind.Data, options?.name);

    this.dataChannelInit = {
      // only support in-band channels
      negotiated: false,
    };
    if (!options) return;

    if (options.ordered !== undefined) {
      this.dataChannelInit.ordered = options.ordered;
    }
    if (options.maxPacketLifeTime !== undefined) {
      this.dataChannelInit.maxPacketLifeTime = options.maxPacketLifeTime;
    }
    if (options.maxRetransmits !== undefined) {
      this.dataChannelInit.maxRetransmits = options.maxRetransmits;
    }
  }

  send(data: string | Blob | ArrayBuffer | ArrayBufferView) {
    // not yet published
    if (!this.dataChannel) return;

    // force cast since linter isn't liking it
    this.dataChannel.send(<any>data);
  }

  stop() {
    if (this.dataChannel) this.dataChannel.close();
  }
}
