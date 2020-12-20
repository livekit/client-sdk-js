import { TrackEvent } from '../events';
import { Track } from './Track';

export class RemoteDataTrack extends Track {
  readonly maxPacketLifeTime?: number;
  readonly maxRetransmits?: number;
  readonly ordered: boolean;
  readonly reliable: boolean;
  readonly sid: Track.SID;
  private dataChannel: RTCDataChannel;

  constructor(sid: Track.SID, name: string, dataChannel: RTCDataChannel) {
    super(Track.Kind.Data, name);
    this.sid = sid;
    this.dataChannel = dataChannel;

    // parse settings from datachannel
    if (dataChannel.maxPacketLifeTime)
      this.maxPacketLifeTime = dataChannel.maxPacketLifeTime;
    if (dataChannel.maxRetransmits)
      this.maxRetransmits = dataChannel.maxRetransmits;

    this.ordered = dataChannel.ordered;
    this.reliable =
      this.maxPacketLifeTime === undefined && this.maxRetransmits === undefined;

    this.dataChannel.onmessage = (ev) => {
      this.emit(TrackEvent.Message, ev.data, this);
    };
  }

  stop() {
    this.dataChannel.close();
  }
}
