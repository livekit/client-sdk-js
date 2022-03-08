export type ProcessorOptions = {
  track?: MediaStreamTrack;
  element?: HTMLVideoElement;
};

export interface VideoProcessor<T extends ProcessorOptions = ProcessorOptions> {
  init: (opts: T) => void;
  destroy: () => void;
  processedTrack?: MediaStreamTrack;
}
