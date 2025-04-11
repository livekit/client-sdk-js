import type LocalTrack from './LocalTrack';

export class LocalTrackRecorder<T extends LocalTrack> extends MediaRecorder {
  constructor(track: T, options?: MediaRecorderOptions) {
    super(new MediaStream([track.mediaStreamTrack]), options);
  }
}
