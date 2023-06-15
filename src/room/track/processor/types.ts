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
export interface TrackProcessor<T extends Track.Kind> {
  name: string;
  init: (opts: ProcessorOptions<T>) => void;
  destroy: () => Promise<void>;
  processedTrack?: MediaStreamTrack;
}
