import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import log from '../../../logger';

export interface TrackTransform<T> {
  transform: (frame: T) => T;
}

export interface TrackGenerator<T> {
//   kind: 'video' | 'audio';
  writable: T;
}

export type ProcessorOptions = {
  track: MediaStreamTrack;
  element: HTMLVideoElement;
  backgroundUrl: string;
};

export interface Processor<T> {
//   readable: T;
  pipeThrough: (transform: TrackTransform<T>) => Processor<T>;
  pipeTo: (sink: TrackGenerator<T>) => void;
}

export class VirtualBackgroundProcessor {
  source: MediaStreamVideoTrack;

  sourceSettings: MediaTrackSettings;

  isEnabled: boolean = true;

  processor: MediaStreamTrackProcessor<VideoFrame>;

  trackGenerator: MediaStreamTrackGenerator<VideoFrame>;

  canvas: OffscreenCanvas;

  ctx: OffscreenCanvasRenderingContext2D;

  sourceDummy: HTMLVideoElement;

  transformer: TransformStream;

  selfieSegmentation: SelfieSegmentation;

  backgroundImagePattern: CanvasPattern | null = null;

  processedTrack: MediaStreamVideoTrack;

  constructor(opts: ProcessorOptions) {
    this.source = opts.track as MediaStreamVideoTrack;
    this.sourceSettings = this.source.getSettings();
    this.sourceDummy = opts.element;
    this.processor = new MediaStreamTrackProcessor({ track: this.source });
    this.trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    this.transformer = new TransformStream({
      transform: (frame, controller) => this.transform(frame, controller),
    });

    this.processor.readable.pipeThrough(this.transformer).pipeTo(this.trackGenerator.writable);
    this.processedTrack = this.trackGenerator as MediaStreamVideoTrack;

    this.canvas = new OffscreenCanvas(this.sourceSettings.width!, this.sourceSettings.height!);
    this.ctx = this.canvas.getContext('2d')!;

    this.selfieSegmentation = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
    this.selfieSegmentation.setOptions({
      modelSelection: 1,
    });
    this.selfieSegmentation.onResults((results) => { this.segmentationResults = results; });

    this.loadBackground(opts.backgroundUrl).catch((e) => log.error(e));
    setInterval(() => this.selfieSegmentation.send({ image: this.sourceDummy }), 500);
  }

  async loadBackground(path: string) {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = path;
    });
    const imageData = await createImageBitmap(img);
    this.backgroundImagePattern = this.ctx.createPattern(imageData, 'repeat');
  }

  segmentationResults: Results | undefined;

  drawResults(frame: VideoFrame) {
    // this.ctx.save();
    // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.segmentationResults) {
      this.ctx.drawImage(this.segmentationResults.segmentationMask, 0, 0);

      // Only overwrite existing pixels.
      this.ctx.globalCompositeOperation = 'source-out';

      this.ctx.fillStyle = this.backgroundImagePattern ?? '#00FF00';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Only overwrite missing pixels.
      this.ctx.globalCompositeOperation = 'destination-atop';
    }
    this.ctx.drawImage(
      frame, 0, 0, this.canvas.width, this.canvas.height,
    );
    // this.ctx.restore();
  }

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    this.drawResults(frame);
    // @ts-ignore
    const newFrame = new VideoFrame(this.canvas, { timestamp: performance.now() });
    frame.close();
    controller.enqueue(newFrame);
  }
}
