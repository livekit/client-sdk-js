import { EventEmitter } from 'events';
import { ParticipantInfo } from '../proto/model';
import { RTCEngine } from './engine';
import {
  AudioTrack,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  VideoTrack,
} from './track';

export class Participant extends EventEmitter {
  // map of track id => AudioTrack
  audioTracks: { [key: string]: AudioTrack } = {};
  videoTracks: { [key: string]: VideoTrack } = {};
  id: string;
  // client assigned identity
  name: string;

  constructor(info: ParticipantInfo) {
    super();
    this.id = info.id;
    this.name = info.name;
  }
}

export class LocalParticipant extends Participant {
  engine: RTCEngine;

  constructor(info: ParticipantInfo, engine: RTCEngine) {
    super(info);
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

export interface LocalTrackOptions {
  name?: string;
}
