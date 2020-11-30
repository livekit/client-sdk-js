import { EventEmitter } from 'events';
import { ParticipantInfo } from '../proto/model';
import { RTCEngine } from './engine';
import { ParticipantEvent } from './events';
import {
  AudioTrack,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteTrack,
  RemoteVideoTrack,
  VideoTrack,
} from './track';

export class Participant extends EventEmitter {
  // map of track id => AudioTrack
  audioTracks: { [key: string]: AudioTrack } = {};
  videoTracks: { [key: string]: VideoTrack } = {};
  id: string;
  // client assigned identity
  name: string;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
  }
}

export class LocalParticipant extends Participant {
  engine: RTCEngine;

  constructor(id: string, name: string, engine: RTCEngine) {
    super(id, name);
    this.engine = engine;
  }

  publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: LocalTrackOptions
  ) {
    if (track instanceof MediaStreamTrack) {
      const isVideo = track.kind === 'audio';
      // create a new local video track
      if (isVideo) {
        track = new LocalVideoTrack(track, options?.name);
      } else {
        track = new LocalAudioTrack(track, options?.name);
      }
    }

    // depending on the track type, add to each kind
    if (track instanceof LocalVideoTrack) {
      this.videoTracks[track.id] = track;
    } else if (track instanceof LocalAudioTrack) {
      this.audioTracks[track.id] = track;
    }

    // TODO: check data channel
    this.engine.peerConn.addTrack(track.mediaStreamTrack);
  }
}

export class RemoteParticipant extends Participant {
  private participantInfo?: ParticipantInfo;

  constructor(id: string, name?: string) {
    super(id, name || '');
  }

  addTrack(mediaTrack: MediaStreamTrack, id: string): RemoteTrack {
    const isVideo = mediaTrack.kind === 'audio';
    let track: RemoteTrack;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, id);
      this.videoTracks[id] = track;
    } else {
      track = new RemoteAudioTrack(mediaTrack, id);
      this.audioTracks[id] = track;
    }

    // see if we should trigger participantConnected
    if (this.hasMetadata) {
      this.emit(ParticipantEvent.TrackPublished, track);
    }

    return track;
  }

  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  updateMetadata(info: ParticipantInfo) {
    this.name = info.name;
    this.id = info.id;
    this.participantInfo = info;
  }
}

export interface LocalTrackOptions {
  name?: string;
}
