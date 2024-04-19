import { AudioTrackFeature, TrackInfo } from '@livekit/protocol';
import type { LoggerOptions } from '../types';
import LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import type { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import type { TrackPublishOptions } from './options';
export default class LocalTrackPublication extends TrackPublication {
    track?: LocalTrack;
    options?: TrackPublishOptions;
    get isUpstreamPaused(): boolean | undefined;
    constructor(kind: Track.Kind, ti: TrackInfo, track?: LocalTrack, loggerOptions?: LoggerOptions);
    setTrack(track?: Track): void;
    get isMuted(): boolean;
    get audioTrack(): LocalAudioTrack | undefined;
    get videoTrack(): LocalVideoTrack | undefined;
    /**
     * Mute the track associated with this publication
     */
    mute(): Promise<LocalTrack<Track.Kind> | undefined>;
    /**
     * Unmute track associated with this publication
     */
    unmute(): Promise<LocalTrack<Track.Kind> | undefined>;
    /**
     * Pauses the media stream track associated with this publication from being sent to the server
     * and signals "muted" event to other participants
     * Useful if you want to pause the stream without pausing the local media stream track
     */
    pauseUpstream(): Promise<void>;
    /**
     * Resumes sending the media stream track associated with this publication to the server after a call to [[pauseUpstream()]]
     * and signals "unmuted" event to other participants (unless the track is explicitly muted)
     */
    resumeUpstream(): Promise<void>;
    getTrackFeatures(): AudioTrackFeature[];
    handleTrackEnded: () => void;
}
//# sourceMappingURL=LocalTrackPublication.d.ts.map