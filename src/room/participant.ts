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
  sid: string;
  // client assigned identity
  name: string;

  constructor(sid: string, name: string) {
    super();
    this.sid = sid;
    this.name = name;
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

  static fromParticipantInfo(pi: ParticipantInfo): RemoteParticipant {
    const rp = new RemoteParticipant(pi.sid, pi.name);
    rp.updateMetadata(pi);
    return rp;
  }

  constructor(id: string, name?: string) {
    super(id, name || '');
  }

  addTrack(mediaTrack: MediaStreamTrack, id: string): RemoteTrack {
    const isVideo = mediaTrack.kind === 'video';
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
      this.emit(ParticipantEvent.TrackSubscribed, track);
    }

    return track;
  }

  get hasMetadata(): boolean {
    return !!this.participantInfo;
  }

  updateMetadata(info: ParticipantInfo) {
    this.name = info.name;
    this.sid = info.sid;
    this.participantInfo = info;
  }
}

export interface LocalTrackOptions {
  name?: string;
}
