import { EventEmitter } from 'events';
import { ParticipantInfo } from '../../proto/livekit_models';
import { ParticipantEvent, TrackEvent } from '../events';
import { Track } from '../track/Track';
import { TrackPublication } from '../track/TrackPublication';

export type AudioTrackMap = { [key: string]: TrackPublication };
export type VideoTrackMap = { [key: string]: TrackPublication };
export type DataTrackMap = { [key: string]: TrackPublication };

export class Participant extends EventEmitter {
  protected participantInfo?: ParticipantInfo;
  audioTracks: Map<string, TrackPublication>;
  videoTracks: Map<string, TrackPublication>;
  dataTracks: Map<string, TrackPublication>;

  /** map of track sid => all published tracks */
  tracks: Map<string, TrackPublication>;
  /** audio level between 0-1.0, 1 being loudest, 0 being softest */
  audioLevel: number = 0;
  /** server assigned unique id */
  sid: string;
  /** client assigned identity, encoded in JWT token */
  identity: string;
  /** client metadata, opaque to livekit */
  metadata?: string;

  /** @internal */
  constructor(sid: string, identity: string) {
    super();
    this.sid = sid;
    this.identity = identity;
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.dataTracks = new Map();
    this.tracks = new Map();
  }

  getTracks(): TrackPublication[] {
    return Array.from(this.tracks.values());
  }

  /** @internal */
  updateInfo(info: ParticipantInfo) {
    this.identity = info.identity;
    this.sid = info.sid;
    this.setMetadata(info.metadata);
    // set this last so setMetadata can detect changes
    this.participantInfo = info;
  }

  /** @internal */
  setMetadata(md: string) {
    const changed =
      !this.participantInfo || this.participantInfo.metadata != md;
    const prevMetadata = this.metadata;
    this.metadata = md;

    if (changed) {
      this.emit(ParticipantEvent.MetadataChanged, prevMetadata);
    }
  }

  protected addTrackPublication(publication: TrackPublication) {
    // forward publication driven events
    publication.on(TrackEvent.Muted, () => {
      this.emit(ParticipantEvent.TrackMuted, publication);
    });

    publication.on(TrackEvent.Unmuted, () => {
      this.emit(ParticipantEvent.TrackUnmuted, publication);
    });

    if (publication.track) {
      publication.track.sid = publication.trackSid;
    }

    this.tracks.set(publication.trackSid, publication);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.set(publication.trackSid, publication);
        break;
      case Track.Kind.Video:
        this.videoTracks.set(publication.trackSid, publication);
        break;
      case Track.Kind.Data:
        this.dataTracks.set(publication.trackSid, publication);
        break;
    }
  }
}
