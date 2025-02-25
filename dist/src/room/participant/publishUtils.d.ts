import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalVideoTrack from '../track/LocalVideoTrack';
import type { BackupVideoCodec, TrackPublishOptions, VideoCodec, VideoEncoding } from '../track/options';
import { VideoPreset } from '../track/options';
import type { LoggerOptions } from '../types';
/** @internal */
export declare function mediaTrackToLocalTrack(mediaStreamTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, loggerOptions?: LoggerOptions): LocalVideoTrack | LocalAudioTrack;
export declare const presets169: VideoPreset[];
export declare const presets43: VideoPreset[];
export declare const presetsScreenShare: VideoPreset[];
export declare const defaultSimulcastPresets169: VideoPreset[];
export declare const defaultSimulcastPresets43: VideoPreset[];
export declare const computeDefaultScreenShareSimulcastPresets: (fromPreset: VideoPreset) => VideoPreset[];
export declare function computeVideoEncodings(isScreenShare: boolean, width?: number, height?: number, options?: TrackPublishOptions): RTCRtpEncodingParameters[];
export declare function computeTrackBackupEncodings(track: LocalVideoTrack, videoCodec: BackupVideoCodec, opts: TrackPublishOptions): RTCRtpEncodingParameters[] | undefined;
export declare function determineAppropriateEncoding(isScreenShare: boolean, width: number, height: number, codec?: VideoCodec): VideoEncoding;
export declare function presetsForResolution(isScreenShare: boolean, width: number, height: number): VideoPreset[];
export declare function defaultSimulcastLayers(isScreenShare: boolean, original: VideoPreset): VideoPreset[];
/** @internal */
export declare function sortPresets(presets: Array<VideoPreset> | undefined): VideoPreset[] | undefined;
/** @internal */
export declare class ScalabilityMode {
    spatial: number;
    temporal: number;
    suffix: undefined | 'h' | '_KEY' | '_KEY_SHIFT';
    constructor(scalabilityMode: string);
    toString(): string;
}
export declare function getDefaultDegradationPreference(track: LocalVideoTrack): RTCDegradationPreference;
//# sourceMappingURL=publishUtils.d.ts.map