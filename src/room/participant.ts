import { EventEmitter } from 'events';
import { ParticipantInfo, TrackInfo } from '../proto/model';
import { RTCEngine } from './engine';
import { TrackInvalidError } from './errors';
import { ParticipantEvent } from './events';
import {
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteTrack,
  RemoteVideoTrack,
  Track,
} from './track';
import {
  AudioTrackPublication,
  DataTrackPublication,
  LocalAudioTrackPublication,
  LocalTrackPublication,
  LocalVideoTrackPublication,
  RemoteAudioTrackPublication,
  RemoteTrackPublication,
  RemoteVideoTrackPublication,
  TrackPublication,
  VideoTrackPublication,
} from './trackPublication';

export type AudioTrackMap = { [key: string]: AudioTrackPublication };
export type VideoTrackMap = { [key: string]: VideoTrackPublication };
export type DataTrackMap = { [key: string]: DataTrackPublication };

export class Participant extends EventEmitter {
  // map of track id => AudioTrack
  audioTracks: AudioTrackMap = {};
  videoTracks: VideoTrackMap = {};
  dataTracks: DataTrackMap = {};
  tracks: { [key: string]: TrackPublication } = {};
  sid: string;
  // client assigned identity
  name: string;

  constructor(sid: string, name: string) {
    super();
    this.sid = sid;
    this.name = name;
  }

  protected addTrackPublication(publication: TrackPublication) {
    this.tracks[publication.trackSid] = publication;
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks[publication.trackSid] = <AudioTrackPublication>(
          publication
        );
        break;
      case Track.Kind.Video:
        this.videoTracks[publication.trackSid] = <VideoTrackPublication>(
          publication
        );
        break;
      case Track.Kind.Data:
        this.dataTracks[publication.trackSid] = <DataTrackPublication>(
          publication
        );
        break;
    }
  }
}

export class LocalParticipant extends Participant {
  engine: RTCEngine;

  constructor(sid: string, name: string, engine: RTCEngine) {
    super(sid, name);
    this.engine = engine;
  }

  publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: LocalTrackOptions
  ) {
    if (this.audioTracks[track.id] || this.videoTracks[track.id]) {
      // already published.. ignore
      return;
    }

    if (track instanceof MediaStreamTrack) {
      switch (track.kind) {
        case 'audio':
          track = new LocalAudioTrack(track, options?.name);
          break;
        case 'video':
          track = new LocalVideoTrack(track, options?.name);
          break;
        default:
          throw new TrackInvalidError(
            `unsupported MediaStreamTrack kind ${track.kind}`
          );
      }
    }

    // create track publication from track
    let trackPublication: LocalTrackPublication;
    switch (track.kind) {
      case Track.Kind.Audio:
        trackPublication = new LocalAudioTrackPublication(track);
        this.audioTracks[track.id] = trackPublication;
        break;
      case Track.Kind.Video:
        trackPublication = new LocalVideoTrackPublication(
          <LocalVideoTrack>track
        );
        this.videoTracks[track.id] = trackPublication;
        break;
      default:
        // impossible
        throw new TrackInvalidError();
    }

    // send event for publication
    this.emit(ParticipantEvent.TrackPublished, trackPublication);

    // TODO: check data channel
    this.engine.peerConn.addTrack(track.mediaStreamTrack);
  }

  unpublishTrack(track: LocalTrack): LocalTrackPublication | null {
    if (!this.tracks[track.id]) {
      return null;
    }
    // TODO: need another way to associate the tracks
    const publication = <LocalTrackPublication>this.tracks[track.id];
    track.stop();
    const senders = this.engine.peerConn.getSenders();
    senders.forEach((sender) => {
      if (sender.track === track.mediaStreamTrack) {
        this.engine.peerConn.removeTrack(sender);
      }
    });

    return publication;
  }

  unpublishTracks(tracks: LocalTrack[]): LocalTrackPublication[] {
    const publications: LocalTrackPublication[] = [];
    tracks.forEach((track) => {
      const pub = this.unpublishTrack(track);
      if (pub) {
        publications.push(pub);
      }
    });
    return publications;
  }
}

export class RemoteParticipant extends Participant {
  private participantInfo?: ParticipantInfo;
  tracks: { [key: string]: RemoteTrackPublication } = {};

  static fromParticipantInfo(pi: ParticipantInfo): RemoteParticipant {
    const rp = new RemoteParticipant(pi.sid, pi.name);
    rp.updateMetadata(pi);
    return rp;
  }

  constructor(id: string, name?: string) {
    super(id, name || '');
  }

  addSubscribedTrack(
    mediaTrack: MediaStreamTrack,
    id: string
  ): RemoteTrackPublication {
    const isVideo = mediaTrack.kind === 'video';
    let track: RemoteTrack;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, id);
    } else {
      track = new RemoteAudioTrack(mediaTrack, id);
    }

    // find the track publication or create one
    // it's possible for the media track to arrive before participant info
    let publication = this.getTrackPublication(id);
    let newTrackPublication = !publication;

    if (!publication) {
      const info: TrackInfo = {
        sid: id,
        name: mediaTrack.label,
        type: Track.kindToProto(track.kind),
      };
      switch (track.kind) {
        case Track.Kind.Audio:
          publication = new RemoteAudioTrackPublication(
            info,
            <RemoteAudioTrack>track
          );
          break;
        case Track.Kind.Video:
          publication = new RemoteVideoTrackPublication(
            info,
            <RemoteVideoTrack>track
          );
          break;
        default:
          throw new TrackInvalidError();
      }
    }

    if (newTrackPublication) {
      this.addTrackPublication(publication);
      // only send this after metadata is filled in, which indicates the track
      // is published AFTER client connected to room
      if (this.hasMetadata) {
        this.emit(ParticipantEvent.TrackPublished, publication);
      }
    }

    // when media track is ended, fire the event
    mediaTrack.onended = (ev) => {
      this.emit(ParticipantEvent.TrackUnsubscribed, track, publication);
    };

    this.emit(ParticipantEvent.TrackSubscribed, track, publication);

    return publication;
  }

  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  getTrackPublication(id: Track.SID): RemoteTrackPublication | null {
    return <RemoteTrackPublication>this.tracks[id];
  }

  updateMetadata(info: ParticipantInfo) {
    const alreadyHasMetadata = this.hasMetadata;

    this.name = info.name;
    this.sid = info.sid;
    this.participantInfo = info;

    // we are getting a list of all available tracks, reconcile in here
    // and send out events for changes

    // reconcile track publications, publish events only if metadata is already there
    // i.e. changes since the local participant has joined
    const validTracks: { [key: string]: RemoteTrackPublication } = {};
    const newTracks: { [key: string]: RemoteTrackPublication } = {};

    info.tracks.forEach((ti) => {
      let publication = this.getTrackPublication(ti.sid);
      if (!publication) {
        // new publication
        publication = RemoteTrackPublication.createTrackFromInfo(ti);
        newTracks[ti.sid] = publication;
        this.addTrackPublication(publication);
      }
      validTracks[ti.sid] = publication;
    });

    // send new tracks
    if (alreadyHasMetadata) {
      Object.keys(newTracks).forEach((sid) => {
        const publication = newTracks[sid];
        this.emit(ParticipantEvent.TrackPublished, publication);
      });
    }

    // detect removed tracks
    Object.keys(this.tracks).forEach((sid) => {
      if (!validTracks[sid]) {
        this.unpublishTrack(sid, true);
      }
    });
  }

  unpublishTrack(sid: Track.SID, sendEvents?: boolean) {
    const publication = <RemoteTrackPublication>this.tracks[sid];
    if (!publication) {
      return;
    }

    delete this.tracks[sid];

    // remove from the right type map
    switch (publication.kind) {
      case Track.Kind.Audio:
        delete this.audioTracks[sid];
        break;
      case Track.Kind.Video:
        delete this.videoTracks[sid];
        break;
      case Track.Kind.Data:
        delete this.dataTracks[sid];
        break;
    }

    // also send unsubscribe, if track is actively subscribed
    if (publication.track) {
      publication.track.stop();
      if (sendEvents)
        this.emit(ParticipantEvent.TrackUnsubscribed, publication);
    }
    if (sendEvents) this.emit(ParticipantEvent.TrackUnpublished, publication);
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    console.debug('participant event', this.sid, event, ...args);
    return super.emit(event, ...args);
  }
}

export interface LocalTrackOptions {
  name?: string;
}
