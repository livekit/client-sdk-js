import type LocalTrack from './LocalTrack';

export class LocalTrackRecorder<T extends LocalTrack> extends MediaRecorder {
  byteStream: ReadableStream<Uint8Array>;

  constructor(track: T, options?: MediaRecorderOptions) {
    super(new MediaStream([track.mediaStreamTrack]), options);

    let dataListener: (event: BlobEvent) => void;

    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

    const onStop = () => {
      this.removeEventListener('dataavailable', dataListener);
      this.removeEventListener('stop', onStop);
      this.removeEventListener('error', onError);
      streamController?.close();
      streamController = undefined;
    };

    const onError = (event: Event) => {
      streamController?.error(event);
      this.removeEventListener('dataavailable', dataListener);
      this.removeEventListener('stop', onStop);
      this.removeEventListener('error', onError);
      streamController = undefined;
    };

    this.byteStream = new ReadableStream({
      start: (controller) => {
        streamController = controller;
        dataListener = async (event) => {
          controller.enqueue(await event.data.bytes());
        };
        this.addEventListener('dataavailable', dataListener);
      },
      cancel: () => {
        onStop();
      },
    });

    this.addEventListener('stop', onStop);
    this.addEventListener('error', onError);
  }
}
