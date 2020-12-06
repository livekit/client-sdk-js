import { EventEmitter } from 'events';
import { ParticipantInfo, TrackInfo, TrackInfo_Type } from '../proto/model';
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
  sid: string;
  // client assigned identity
  name: string;

  constructor(sid: string, name: string) {
    super();
    this.sid = sid;
    this.name = name;
  }

  protected addTrackPublication(publication: TrackPublication) {
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
}

export class RemoteParticipant extends Participant {
  private participantInfo?: ParticipantInfo;

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
    let trackPublication = this.getTrackPublication(track.kind, id);
    let newTrackPublication = !trackPublication;

    if (!trackPublication) {
      const info: TrackInfo = {
        sid: id,
        name: mediaTrack.label,
        type: Track.kindToProto(track.kind),
      };
      switch (track.kind) {
        case Track.Kind.Audio:
          trackPublication = new RemoteAudioTrackPublication(info);
          break;
        case Track.Kind.Video:
          trackPublication = new RemoteVideoTrackPublication(info);
          break;
        default:
          throw new TrackInvalidError();
      }
    }

    if (newTrackPublication) {
      this.addTrackPublication(trackPublication);
      // only send this after metadata is filled in, which indicates the track
      // is published AFTER client connected to room
      if (this.hasMetadata) {
        this.emit(ParticipantEvent.TrackPublished, trackPublication);
      }
    }

    this.emit(ParticipantEvent.TrackSubscribed, track, trackPublication);

    return trackPublication;
  }

  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  getTrackPublication(
    kind: Track.Kind | TrackInfo_Type,
    id: Track.SID
  ): RemoteTrackPublication | null {
    let publication: RemoteTrackPublication | null = null;

    switch (kind) {
      case Track.Kind.Audio:
      case TrackInfo_Type.AUDIO:
        publication = <RemoteAudioTrackPublication>this.audioTracks[id];
        break;
      case Track.Kind.Video:
      case TrackInfo_Type.VIDEO:
        publication = <RemoteVideoTrackPublication>this.videoTracks[id];
        break;
      case Track.Kind.Data:
      case TrackInfo_Type.DATA:
        break;
    }

    return publication;
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
      let publication = this.getTrackPublication(ti.type, ti.sid);
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
    const detectRemovedTracks = (tracks: {
      [key: string]: TrackPublication;
    }) => {
      Object.keys(tracks).forEach((sid) => {
        if (!validTracks[sid]) {
          const track = tracks[sid];
          delete tracks[sid];
          this.emit(ParticipantEvent.TrackUnpublished, track);
        }
      });
    };

    detectRemovedTracks(this.audioTracks);
    detectRemovedTracks(this.videoTracks);
    detectRemovedTracks(this.dataTracks);
  }
}

export interface LocalTrackOptions {
  name?: string;
}
