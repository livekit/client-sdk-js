import { TrackPublishedResponse } from '@livekit/protocol';
import type { AudioProcessorOptions, TrackProcessor, VideoProcessorOptions } from '../..';
import { Track } from './Track';
import type { TrackPublication } from './TrackPublication';
import type { AudioCaptureOptions, CreateLocalTracksOptions, ScreenShareCaptureOptions, VideoCaptureOptions, VideoCodec } from './options';
import type { AudioTrack } from './types';
export declare function mergeDefaultOptions(options?: CreateLocalTracksOptions, audioDefaults?: AudioCaptureOptions, videoDefaults?: VideoCaptureOptions): CreateLocalTracksOptions;
export declare function constraintsForOptions(options: CreateLocalTracksOptions): MediaStreamConstraints;
/**
 * This function detects silence on a given [[Track]] instance.
 * Returns true if the track seems to be entirely silent.
 */
export declare function detectSilence(track: AudioTrack, timeOffset?: number): Promise<boolean>;
/**
 * @internal
 */
export declare function getNewAudioContext(): AudioContext | void;
/**
 * @internal
 */
export declare function kindToSource(kind: MediaDeviceKind): Track.Source.Camera | Track.Source.Microphone | Track.Source.Unknown;
/**
 * @internal
 */
export declare function sourceToKind(source: Track.Source): MediaDeviceKind | undefined;
/**
 * @internal
 */
export declare function screenCaptureToDisplayMediaStreamOptions(options: ScreenShareCaptureOptions): DisplayMediaStreamOptions;
export declare function mimeTypeToVideoCodecString(mimeType: string): VideoCodec;
export declare function getTrackPublicationInfo<T extends TrackPublication>(tracks: T[]): TrackPublishedResponse[];
export declare function getLogContextFromTrack(track: Track | TrackPublication): Record<string, unknown>;
export declare function supportsSynchronizationSources(): boolean;
export declare function diffAttributes(oldValues: Record<string, string> | undefined, newValues: Record<string, string> | undefined): Record<string, string>;
/** @internal */
export declare function extractProcessorsFromOptions(options: CreateLocalTracksOptions): {
    audioProcessor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined;
    videoProcessor: TrackProcessor<Track.Kind.Video, VideoProcessorOptions> | undefined;
    optionsWithoutProcessor: {
        audio?: boolean | AudioCaptureOptions;
        video?: boolean | VideoCaptureOptions;
    };
};
//# sourceMappingURL=utils.d.ts.map
