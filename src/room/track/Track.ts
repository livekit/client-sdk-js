import { EventEmitter } from 'events';
import { TrackInfo_Type } from '../../proto/model';

export class Track extends EventEmitter {
  kind: Track.Kind;
  name: string;

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

  export function kindToProto(k: Kind): TrackInfo_Type {
    switch (k) {
      case Kind.Audio:
        return TrackInfo_Type.AUDIO;
      case Kind.Video:
        return TrackInfo_Type.VIDEO;
      case Kind.Data:
        return TrackInfo_Type.DATA;
    }
  }
}
