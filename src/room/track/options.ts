import { VideoCodec, VideoEncoding } from '../../options';

export interface LocalTrackOptions {
  name?: string;

  // encoding parameters, if not passed in, it'll automatically select an appropriate
  // encoding based on bitrate
  videoEncoding?: VideoEncoding;

  // codec, defaults to vp8
  videoCodec?: VideoCodec;

  // use simulcast, defaults to false
  simulcast?: boolean;
}

export interface LocalDataTrackOptions extends LocalTrackOptions {
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  ordered?: boolean;
}
