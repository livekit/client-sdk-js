import { EventEmitter } from 'events'
import { TrackInfo } from '../../proto/livekit_models'
import { TrackEvent } from '../events'
import { AudioTrack } from './AudioTrack'
import { Track } from './Track'
import { MediaTrack } from './types'
import { VideoTrack } from './VideoTrack'

export class TrackPublication extends EventEmitter {
  kind: Track.Kind;
  trackName: string;
  trackSid: Track.SID;
  track?: Track;

  protected _isMuted: boolean = false;

  constructor(kind: Track.Kind, id: string, name: string) {
    super();
    this.kind = kind;
    this.trackSid = id;
    this.trackName = name;
  }

  get isMuted(): boolean {
    if (!this.track) {
      return false;
    }
    return this._isMuted;
  }

  /** @internal */
  setTrack(track?: Track) {
    this.track = track;

    if (track) {
      // forward events
      track.on(TrackEvent.Muted, () => {
        this.emit(TrackEvent.Muted);
      });

      track.on(TrackEvent.Unmuted, () => {
        this.emit(TrackEvent.Unmuted);
      });
    }
  }

  /**
   * an [AudioTrack] if this publication holds an audio track
   */
  get audioTrack(): AudioTrack | undefined {
    if (this.track instanceof AudioTrack) {
      return this.track;
    }
  }

  /**
   * an [VideoTrack] if this publication holds a video track
   */
  get videoTrack(): VideoTrack | undefined {
    if (this.track instanceof VideoTrack) {
      return this.track;
    }
  }

  /**
   * returns an audio or video track
   */
  get mediaTrack(): MediaTrack | undefined {
    if (this.track instanceof VideoTrack || this.track instanceof AudioTrack) {
      return this.track;
    }
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    this.trackSid = info.sid;
    this.trackName = info.name;
  }
}
