import { EventEmitter } from 'events';
import { ParticipantInfo } from '../proto/model';
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
  rtcConn: RTCPeerConnection;
  constructor(info: ParticipantInfo, rtcConn: RTCPeerConnection) {
    super(info);
    this.rtcConn = rtcConn;
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

    // TODO: publish

    this.rtcConn.addTrack(track.mediaStreamTrack);
  }
}

export interface LocalTrackOptions {
  name?: string;
}
