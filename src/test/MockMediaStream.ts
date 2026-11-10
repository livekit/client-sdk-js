// happy-dom's MediaStream has no getTracks and generates its own id
export default class MockMediaStream extends MediaStream {
  readonly id: string;

  constructor(id: string, tracks: MediaStreamTrack[]) {
    super(tracks);
    this.id = id;
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.getAudioTracks(), ...this.getVideoTracks()];
  }
}
