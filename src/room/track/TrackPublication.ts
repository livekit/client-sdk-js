import { EventEmitter } from 'events';
import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import LocalAudioTrack from './LocalAudioTrack';
import LocalVideoTrack from './LocalVideoTrack';
import RemoteAudioTrack from './RemoteAudioTrack';
import RemoteVideoTrack from './RemoteVideoTrack';
import { Track } from './Track';

export default class TrackPublication extends EventEmitter {
  kind: Track.Kind;

  trackName: string;

  trackSid: Track.SID;

  track?: Track;

  source: Track.Source;

  /** dimension of the original published stream, video-only */
  dimensions?: Track.Dimensions;

  /** true if track was simulcasted to server, video-only */
  simulcasted?: boolean;

  protected metadataMuted: boolean = false;

  constructor(kind: Track.Kind, id: string, name: string) {
    super();
    this.kind = kind;
    this.trackSid = id;
    this.trackName = name;
    this.source = Track.Source.Unknown;
  }

  /** @internal */
  setTrack(track?: Track) {
    if (this.track) {
      this.track.off(TrackEvent.Muted, this.handleMuted);
      this.track.off(TrackEvent.Unmuted, this.handleUnmuted);
    }

    this.track = track;

    if (track) {
      // forward events
      track.on(TrackEvent.Muted, this.handleMuted);
      track.on(TrackEvent.Unmuted, this.handleUnmuted);
    }
  }

  get isMuted(): boolean {
    return this.metadataMuted;
  }

  get isEnabled(): boolean {
    return true;
  }

  get isSubscribed(): boolean {
    return this.track !== undefined;
  }

  /**
   * an [AudioTrack] if this publication holds an audio track
   */
  get audioTrack(): LocalAudioTrack | RemoteAudioTrack | undefined {
    if (this.track instanceof LocalAudioTrack || this.track instanceof RemoteAudioTrack) {
      return this.track;
    }
  }

  /**
   * an [VideoTrack] if this publication holds a video track
   */
  get videoTrack(): LocalVideoTrack | RemoteVideoTrack | undefined {
    if (this.track instanceof LocalVideoTrack || this.track instanceof RemoteVideoTrack) {
      return this.track;
    }
  }

  handleMuted = () => {
    this.emit(TrackEvent.Muted);
  };

  handleUnmuted = () => {
    this.emit(TrackEvent.Unmuted);
  };

  /** @internal */
  updateInfo(info: TrackInfo) {
    this.trackSid = info.sid;
    this.trackName = info.name;
    this.source = Track.sourceFromProto(info.source);
    if (this.kind === Track.Kind.Video && info.width > 0) {
      this.dimensions = {
        width: info.width,
        height: info.height,
      };
      this.simulcasted = info.simulcast;
    }
  }

  dispose() {
    this.track?.off(TrackEvent.Muted, this.handleMuted);
    this.track?.off(TrackEvent.Unmuted, this.handleUnmuted);
  }
}
