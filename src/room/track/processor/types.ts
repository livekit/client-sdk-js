import type { Track } from '../Track';

/**
 * @experimental
 */
export type ProcessorOptions<T extends Track.Kind> = {
  kind: T;
  track: MediaStreamTrack;
  element?: HTMLMediaElement;
};

/**
 * @experimental
 */
export interface AudioProcessorOptions extends ProcessorOptions<Track.Kind.Audio> {
  audioContext: AudioContext;
}

/**
 * @experimental
 */
export interface VideoProcessorOptions extends ProcessorOptions<Track.Kind.Video> {}

/**
 * @experimental
 */
export interface TrackProcessor<
  T extends Track.Kind,
  U extends ProcessorOptions<T> = ProcessorOptions<T>,
> {
  name: string;
  init: (opts: U) => void;
  destroy: () => Promise<void>;
  processedTrack?: MediaStreamTrack;
}
