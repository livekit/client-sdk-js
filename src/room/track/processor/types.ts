import LocalVideoTrack from '../LocalVideoTrack';
import { VideoTrack } from '../types';

export interface TrackTransform<T> {
  transform: (frame: T) => T;
}

export interface TrackGenerator<T> {
//   kind: 'video' | 'audio';
  writable: T;
}

export type ProcessorOptions = {
  track: VideoTrack;
};

export interface Processor<T> {
//   readable: T;
  pipeThrough: (transform: TrackTransform<T>) => Processor<T>;
  pipeTo: (sink: TrackGenerator<T>) => void;
}

export class TrackCanvasProcessor implements Processor<ImageData> {
  source: VideoTrack;

  sourceDummy: HTMLVideoElement;

  sourceSettings: MediaTrackSettings;

  protected sourceFrameCanvas: HTMLCanvasElement;

  protected canvasContext: CanvasRenderingContext2D;

  private transform: TrackTransform<ImageData> | undefined;

  private sink: TrackGenerator<ImageData> | undefined;

  processLoop: number | NodeJS.Timer | undefined;

  isEnabled: boolean = true;

  constructor(opts: ProcessorOptions) {
    this.source = opts.track;
    this.sourceSettings = this.source.mediaStreamTrack.getSettings();
    this.sourceDummy = this.source.attach() as HTMLVideoElement;
    const { width, height } = this.sourceSettings;

    // @ts-ignore
    this.sourceFrameCanvas = new OffscreenCanvas(width, height);
    this.canvasContext = this.sourceFrameCanvas.getContext('2d')!;
  }

  private get readable() {
    const { width, height } = this.sourceSettings;
    this.canvasContext.drawImage(
      this.sourceDummy, 0, 0, width!, height!,
    );
    return this.canvasContext.getImageData(0, 0, width!, height!);
  }

  pipeThrough(transform: TrackTransform<ImageData>)
    : Processor<ImageData> {
    this.transform = transform;
    return this;
  }

  pipeTo(sink: TrackGenerator<ImageData>) {
    this.sink = sink;
    // @ts-ignore
    clearInterval(this.processLoop);
    this.processLoop = setInterval(() => this.process(), this.sourceSettings.frameRate);
  }

  protected async process() {
    if (!this.sink) return;
    const frame = this.transform ? await this.transform.transform(this.readable) : this.readable;
    this.sink.writable = frame;
  }
}

export class MyTransformer implements TrackTransform<ImageData> {
  transform(frame: ImageData): ImageData {
    return new ImageData(frame.data.map((v) => (v > 100 ? v : 0)), frame.width, frame.height);
  }
}

export class MyTrackGenerator implements TrackGenerator<ImageData> {
  frameData: any;

  destCanvas: HTMLCanvasElement;

  constructor(width: number, height: number) {
    this.destCanvas = document.createElement('canvas');
    this.destCanvas.width = width;
    this.destCanvas.height = height;
  }

  set writable(value: ImageData) {
    this.destCanvas.getContext('2d')?.putImageData(value, 0, 0);
  }

  get track() {
    // @ts-ignore
    const track = new LocalVideoTrack(his.destCanvas.captureStream(20).getTracks()[0]);
    return track;
  }
}
