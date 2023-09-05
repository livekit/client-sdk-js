import LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import type { AudioCaptureOptions, CreateLocalTracksOptions, ScreenShareCaptureOptions, VideoCaptureOptions } from './options';
/**
 * Creates a local video and audio track at the same time. When acquiring both
 * audio and video tracks together, it'll display a single permission prompt to
 * the user instead of two separate ones.
 * @param options
 */
export declare function createLocalTracks(options?: CreateLocalTracksOptions): Promise<Array<LocalTrack>>;
/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
export declare function createLocalVideoTrack(options?: VideoCaptureOptions): Promise<LocalVideoTrack>;
export declare function createLocalAudioTrack(options?: AudioCaptureOptions): Promise<LocalAudioTrack>;
/**
 * Creates a screen capture tracks with getDisplayMedia().
 * A LocalVideoTrack is always created and returned.
 * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
 */
export declare function createLocalScreenTracks(options?: ScreenShareCaptureOptions): Promise<Array<LocalTrack>>;
//# sourceMappingURL=create.d.ts.map
