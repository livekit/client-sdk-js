import type Room from '../../Room';
import type LocalTrack from '../LocalTrack';
import type { Track } from '../Track';

/**
 * @experimental
 */
export type ProcessorOptions<T extends Track.Kind> = {
  kind: T;
  track: MediaStreamTrack;
  element?: HTMLMediaElement;
  audioContext?: AudioContext;
  localTrack?: LocalTrack;
};

export interface AudioProcessorOptions extends ProcessorOptions<Track.Kind.Audio> {
  audioContext: AudioContext;
}

/**
 * @experimental
 */
export interface VideoProcessorOptions extends ProcessorOptions<Track.Kind.Video> {}

/**
 * A processor is bound to the track it was set on, not to the room, and it does not survive the
 * track being stopped: unpublishing a track or disconnecting from a room destroys its processor.
 * Both paths stop the track by default, so after reconnecting or republishing, call
 * `setProcessor` again on the new track to put the processor back.
 *
 * The exception is `stopLocalTrackOnUnpublish: false`, which keeps the track alive across an
 * unpublish or disconnect. A video processor then survives with it. An audio processor only
 * survives if the audio context came from the application, because a context the SDK created is
 * closed on disconnect and the processor goes with it.
 */
export interface TrackProcessor<
  T extends Track.Kind,
  U extends ProcessorOptions<T> = ProcessorOptions<T>,
> {
  name: string;
  init: (opts: U) => Promise<void>;
  restart: (opts: U) => Promise<void>;
  destroy: () => Promise<void>;
  processedTrack?: MediaStreamTrack;
  onPublish?: (room: Room) => Promise<void>;
  onUnpublish?: () => Promise<void>;
}
