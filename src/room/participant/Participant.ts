import { EventEmitter } from 'events';
import { ConnectionQuality as ProtoQuality, ParticipantInfo } from '../../proto/livekit_models';
import { ParticipantEvent, TrackEvent } from '../events';
import { Track } from '../track/Track';
import TrackPublication from '../track/TrackPublication';

export enum ConnectionQuality {
  Excellent = 'excellent',
  Good = 'good',
  Poor = 'poor',
  Unknown = 'unknown',
}

function qualityFromProto(q: ProtoQuality): ConnectionQuality {
  switch (q) {
    case ProtoQuality.EXCELLENT:
      return ConnectionQuality.Excellent;
    case ProtoQuality.GOOD:
      return ConnectionQuality.Good;
    case ProtoQuality.POOR:
      return ConnectionQuality.Poor;
    default:
      return ConnectionQuality.Unknown;
  }
}

export default class Participant extends EventEmitter {
  protected participantInfo?: ParticipantInfo;

  audioTracks: Map<string, TrackPublication>;

  videoTracks: Map<string, TrackPublication>;

  /** map of track sid => all published tracks */
  tracks: Map<string, TrackPublication>;

  /** audio level between 0-1.0, 1 being loudest, 0 being softest */
  audioLevel: number = 0;

  /** if participant is currently speaking */
  isSpeaking: boolean = false;

  /** server assigned unique id */
  sid: string;

  /** client assigned identity, encoded in JWT token */
  identity: string;

  /** client metadata, opaque to livekit */
  metadata?: string;

  lastSpokeAt?: Date | undefined;

  private _connectionQuality: ConnectionQuality = ConnectionQuality.Unknown;

  /** @internal */
  constructor(sid: string, identity: string) {
    super();
    this.sid = sid;
    this.identity = identity;
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
  }

  getTracks(): TrackPublication[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Finds the first track that matches the source filter, for example, getting
   * the user's camera track with getTrackBySource(Track.Source.Camera).
   * @param source
   * @returns
   */
  getTrack(source: Track.Source): TrackPublication | undefined {
    if (source === Track.Source.Unknown) {
      return;
    }
    for (const [, pub] of this.tracks) {
      if (pub.source === source) {
        return pub;
      }
      if (pub.source === Track.Source.Unknown) {
        if (source === Track.Source.Microphone && pub.kind === Track.Kind.Audio && pub.trackName !== 'screen') {
          return pub;
        }
        if (source === Track.Source.Camera && pub.kind === Track.Kind.Video && pub.trackName !== 'screen') {
          return pub;
        }
        if (source === Track.Source.ScreenShare && pub.kind === Track.Kind.Video && pub.trackName === 'screen') {
          return pub;
        }
        if (source === Track.Source.ScreenShareAudio && pub.kind === Track.Kind.Audio && pub.trackName === 'screen') {
          return pub;
        }
      }
    }
  }

  /**
   * Finds the first track that matches the track's name.
   * @param name
   * @returns
   */
  getTrackByName(name: string): TrackPublication | undefined {
    for (const [, pub] of this.tracks) {
      if (pub.trackName === name) {
        return pub;
      }
    }
  }

  get connectionQuality(): ConnectionQuality {
    return this._connectionQuality;
  }

  get isCameraEnabled(): boolean {
    const track = this.getTrack(Track.Source.Camera);
    return !(track?.isMuted ?? true);
  }

  get isMicrophoneEnabled(): boolean {
    const track = this.getTrack(Track.Source.Microphone);
    return !(track?.isMuted ?? true);
  }

  get isScreenShareEnabled(): boolean {
    const track = this.getTrack(Track.Source.ScreenShare);
    return !!track;
  }

  /** when participant joined the room */
  get joinedAt(): Date | undefined {
    if (this.participantInfo) {
      return new Date(this.participantInfo.joinedAt * 1000);
    }
    return new Date();
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
    const changed = !this.participantInfo || this.participantInfo.metadata !== md;
    const prevMetadata = this.metadata;
    this.metadata = md;

    if (changed) {
      this.emit(ParticipantEvent.MetadataChanged, prevMetadata, this);
      this.emit(ParticipantEvent.ParticipantMetadataChanged, prevMetadata, this);
    }
  }

  /** @internal */
  setIsSpeaking(speaking: boolean) {
    if (speaking === this.isSpeaking) {
      return;
    }
    this.isSpeaking = speaking;
    if (speaking) {
      this.lastSpokeAt = new Date();
    }
    this.emit(ParticipantEvent.IsSpeakingChanged, speaking);
  }

  /** @internal */
  setConnectionQuality(q: ProtoQuality) {
    const prevQuality = this._connectionQuality;
    this._connectionQuality = qualityFromProto(q);
    if (prevQuality !== this._connectionQuality) {
      this.emit(ParticipantEvent.ConnectionQualityChanged, this._connectionQuality);
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

    const pub = publication;
    if (pub.track) {
      pub.track.sid = publication.trackSid;
    }

    this.tracks.set(publication.trackSid, publication);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.set(publication.trackSid, publication);
        break;
      case Track.Kind.Video:
        this.videoTracks.set(publication.trackSid, publication);
        break;
      default:
        break;
    }
  }
}
