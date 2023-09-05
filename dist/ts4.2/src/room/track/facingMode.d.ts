import LocalTrack from './LocalTrack';
import type { VideoCaptureOptions } from './options';
type FacingMode = NonNullable<VideoCaptureOptions['facingMode']>;
type FacingModeFromLocalTrackOptions = {
    /**
     * If no facing mode can be determined, this value will be used.
     * @defaultValue 'user'
     */
    defaultFacingMode?: FacingMode;
};
type FacingModeFromLocalTrackReturnValue = {
    /**
     * The (probable) facingMode of the track.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode | MDN docs on facingMode}
     */
    facingMode: FacingMode;
    /**
     * The confidence that the returned facingMode is correct.
     */
    confidence: 'high' | 'medium' | 'low';
};
/**
 * Try to analyze the local track to determine the facing mode of a track.
 *
 * @remarks
 * There is no property supported by all browsers to detect whether a video track originated from a user- or environment-facing camera device.
 * For this reason, we use the `facingMode` property when available, but will fall back on a string-based analysis of the device label to determine the facing mode.
 * If both methods fail, the default facing mode will be used.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode | MDN docs on facingMode}
 * @experimental
 */
export declare function facingModeFromLocalTrack(localTrack: LocalTrack | MediaStreamTrack, options?: FacingModeFromLocalTrackOptions): FacingModeFromLocalTrackReturnValue;
/**
 * Attempt to analyze the device label to determine the facing mode.
 *
 * @experimental
 */
export declare function facingModeFromDeviceLabel(deviceLabel: string): FacingModeFromLocalTrackReturnValue | undefined;
export {};
//# sourceMappingURL=facingMode.d.ts.map
