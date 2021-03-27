import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteVideoTrack } from './RemoteVideoTrack';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { RemoteTrack } from './types';

export class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;
  isMuted: boolean = false;

  constructor(kind: Track.Kind, id: string, name: string) {
    super(kind, id, name);
  }

  get isSubscribed(): boolean {
    return !!this.track;
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    const changed = this.isMuted !== info.muted;
    this.isMuted = info.muted;
    if (
      this.track instanceof RemoteVideoTrack ||
      this.track instanceof RemoteAudioTrack
    ) {
      this.track.setMuted(info.muted);
    }

    // also fire off muted events
    if (changed) {
      this.emit(info.muted ? TrackEvent.Muted : TrackEvent.Unmuted);
    }
  }
}
