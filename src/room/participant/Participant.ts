import { EventEmitter } from 'events';
import log from 'loglevel';
import { ParticipantEvent, TrackEvent } from '../events';
import { Track } from '../track/Track';
import { TrackPublication } from '../track/TrackPublication';
import {
  AudioTrackPublication,
  DataTrackPublication,
  VideoTrackPublication,
} from '../track/types';

export type AudioTrackMap = { [key: string]: AudioTrackPublication };
export type VideoTrackMap = { [key: string]: VideoTrackPublication };
export type DataTrackMap = { [key: string]: DataTrackPublication };

export class Participant extends EventEmitter {
  // map of track id => AudioTrack
  audioTracks: Map<string, AudioTrackPublication>;
  videoTracks: Map<string, VideoTrackPublication>;
  dataTracks: Map<string, DataTrackPublication>;
  tracks: Map<string, TrackPublication>;
  // audio level between 0-1.0, 1 being loudest, 0 being softest
  audioLevel: number = 0;
  sid: string;
  // client assigned identity
  identity: string;
  // client passed metadata
  metadata: object = {};

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

  setMetadata(md: string) {
    if (!md) {
      this.metadata = {};
    } else {
      try {
        this.metadata = JSON.parse(md);
      } catch (err) {
        log.error('could not decode metadata', err);
      }
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

    this.tracks.set(publication.trackSid, publication);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.set(
          publication.trackSid,
          <AudioTrackPublication>publication
        );
        break;
      case Track.Kind.Video:
        this.videoTracks.set(
          publication.trackSid,
          <VideoTrackPublication>publication
        );
        break;
      case Track.Kind.Data:
        this.dataTracks.set(
          publication.trackSid,
          <DataTrackPublication>publication
        );
        break;
    }
  }
}
