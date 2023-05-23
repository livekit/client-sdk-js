export type ProcessorOptions = {
  track: MediaStreamTrack;
  element?: HTMLMediaElement;
};

export interface TrackProcessor<T extends ProcessorOptions = ProcessorOptions> {
  init: (opts: T) => void;
  destroy: () => Promise<void>;
  processedTrack?: MediaStreamTrack;
}
