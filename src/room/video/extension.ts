import type { CoreRoom } from '../CoreRoom';
import { EngineEvent } from '../events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';
import type LocalTrack from '../track/LocalTrack';
import type LocalTrackPublication from '../track/LocalTrackPublication';
import { Track } from '../track/Track';
import type {
  BackupVideoCodec,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from '../track/options';
import { registerVideoCapture, videoDefaults, videoPublishDefaults } from './create';
import {
  createScreenTracks,
  createVideoPublisher,
  enableCameraAndMicrophone,
  handleSubscribedQualityUpdate,
  publishAdditionalCodecForTrack,
} from './publisher';

/** Methods the `video` extension adds to the local participant. */
export interface VideoLocalApi {
  /**
   * Enable or disable a participant's camera track.
   *
   * If a track has already published, it'll mute or unmute the track.
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setCameraEnabled(
    enabled: boolean,
    options?: VideoCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;

  /**
   * Start or stop sharing a participant's screen
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setScreenShareEnabled(
    enabled: boolean,
    options?: ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;

  /**
   * Publish both camera and microphone at the same time. This is useful for
   * displaying a single Permission Dialog box to the end user.
   */
  enableCameraAndMicrophone(): Promise<void>;

  /**
   * Creates a screen capture tracks with getDisplayMedia().
   * A LocalVideoTrack is always created and returned.
   * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
   */
  createScreenTracks(options?: ScreenShareCaptureOptions): Promise<Array<LocalTrack>>;

  /** @internal
   * publish additional codec to existing track
   */
  publishAdditionalCodecForTrack(
    track: LocalTrack | MediaStreamTrack,
    videoCodec: BackupVideoCodec,
    options?: TrackPublishOptions,
  ): Promise<void>;
}

/**
 * Video publishing: camera and screen share capture, simulcast, SVC and backup codecs.
 * Receiving video is part of core and needs no extension.
 */
export const video = {
  key: /* @__PURE__ */ Symbol('video'),
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<{}, VideoLocalApi> {
    registerVideoCapture();
    room.options.videoCaptureDefaults = { ...videoDefaults, ...room.options.videoCaptureDefaults };
    room.options.publishDefaults = { ...videoPublishDefaults, ...room.options.publishDefaults };

    const participant = room.localParticipant;
    ctx.setLocalParticipantSlot('videoPublisher', createVideoPublisher(room, ctx.log));

    ctx.onEngineCreated((engine) => {
      engine.on(EngineEvent.SubscribedQualityUpdate, (update) =>
        handleSubscribedQualityUpdate(room, ctx.log, update),
      );
    });

    return {
      local: {
        setCameraEnabled: (enabled, options, publishOptions) =>
          participant.setTrackEnabled(Track.Source.Camera, enabled, options, publishOptions),
        setScreenShareEnabled: (enabled, options, publishOptions) =>
          participant.setTrackEnabled(Track.Source.ScreenShare, enabled, options, publishOptions),
        enableCameraAndMicrophone: () => enableCameraAndMicrophone(room),
        createScreenTracks: (options) => createScreenTracks(room, options),
        publishAdditionalCodecForTrack: (track, videoCodec, options) =>
          publishAdditionalCodecForTrack(room, ctx.log, track, videoCodec, options),
      },
    };
  },
} satisfies RoomExtension<{}, VideoLocalApi>;
