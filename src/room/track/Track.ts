import { EventEmitter } from 'events';
import { TrackType } from '../../proto/livekit_models';

export class Track extends EventEmitter {
  kind: Track.Kind;
  name: string;
  /**
   * sid is set after track is published to server, or if it's a remote track
   */
  sid?: Track.SID;

  protected constructor(kind: Track.Kind, name?: string) {
    super();
    this.kind = kind;
    this.name = name || '';
  }
}

export namespace Track {
  export enum Kind {
    Audio = 'audio',
    Video = 'video',
    Data = 'data',
  }
  export type SID = string;
  export type Priority = 'low' | 'standard' | 'high';

  /** @internal */
  export function kindToProto(k: Kind): TrackType {
    switch (k) {
      case Kind.Audio:
        return TrackType.AUDIO;
      case Kind.Video:
        return TrackType.VIDEO;
      case Kind.Data:
        return TrackType.DATA;
    }
  }

  /** @internal */
  export function kindFromProto(t: TrackType): Kind | undefined {
    switch (t) {
      case TrackType.AUDIO:
        return Kind.Audio;
      case TrackType.VIDEO:
        return Kind.Video;
      case TrackType.DATA:
        return Kind.Data;
    }
  }
}
