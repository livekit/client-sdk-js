import {
  AddTrackRequest,
  DataPacket,
  DataPacket_Kind,
  Encryption_Type,
  ParticipantInfo,
  ParticipantPermission,
  SimulcastCodec,
  SubscribedQualityUpdate,
  TrackUnpublishedResponse,
  UserPacket,
} from '@livekit/protocol';
import type { InternalRoomOptions } from '../../options';
import { PCTransportState } from '../PCTransportManager';
import type RTCEngine from '../RTCEngine';
import { defaultVideoCodec } from '../defaults';
import { DeviceUnsupportedError, TrackInvalidError, UnexpectedConnectionState } from '../errors';
import { EngineEvent, ParticipantEvent, TrackEvent } from '../events';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import LocalVideoTrack, { videoLayersFromEncodings } from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import type {
  AudioCaptureOptions,
  BackupVideoCodec,
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from '../track/options';
import { ScreenSharePresets, VideoPresets, isBackupCodec } from '../track/options';
import type { TrackProcessor } from '../track/processor/types';
import {
  constraintsForOptions,
  getLogContextFromTrack,
  mergeDefaultOptions,
  mimeTypeToVideoCodecString,
  screenCaptureToDisplayMediaStreamOptions,
} from '../track/utils';
import type { DataPublishOptions } from '../types';
import {
  Future,
  isE2EESimulcastSupported,
  isFireFox,
  isSVCCodec,
  isSafari17,
  isWeb,
  supportsAV1,
  supportsVP9,
} from '../utils';
import Participant from './Participant';
import type { ParticipantTrackPermission } from './ParticipantTrackPermission';
import { trackPermissionToProto } from './ParticipantTrackPermission';
import {
  computeTrackBackupEncodings,
  computeVideoEncodings,
  getDefaultDegradationPreference,
  mediaTrackToLocalTrack,
} from './publishUtils';

export default class LocalParticipant extends Participant {
  audioTrackPublications: Map<string, LocalTrackPublication>;

  videoTrackPublications: Map<string, LocalTrackPublication>;

  /** map of track sid => all published tracks */
  trackPublications: Map<string, LocalTrackPublication>;

  /** @internal */
  engine: RTCEngine;

  /** @internal */
  activeDeviceMap: Map<MediaDeviceKind, string>;

  private pendingPublishing = new Set<Track.Source>();

  private pendingPublishPromises = new Map<LocalTrack, Promise<LocalTrackPublication>>();

  private cameraError: Error | undefined;

  private microphoneError: Error | undefined;

  private participantTrackPermissions: Array<ParticipantTrackPermission> = [];

  private allParticipantsAllowedToSubscribe: boolean = true;

  // keep a pointer to room options
  private roomOptions: InternalRoomOptions;

  private encryptionType: Encryption_Type = Encryption_Type.NONE;

  private reconnectFuture?: Future<void>;

  /** @internal */
  constructor(sid: string, identity: string, engine: RTCEngine, options: InternalRoomOptions) {
    super(sid, identity, undefined, undefined, {
      loggerName: options.loggerName,
      loggerContextCb: () => this.engine.logContext,
    });
    this.audioTrackPublications = new Map();
    this.videoTrackPublications = new Map();
    this.trackPublications = new Map();
    this.engine = engine;
    this.roomOptions = options;
    this.setupEngine(engine);
    this.activeDeviceMap = new Map();
  }

  get lastCameraError(): Error | undefined {
    return this.cameraError;
  }

  get lastMicrophoneError(): Error | undefined {
    return this.microphoneError;
  }

  get isE2EEEnabled(): boolean {
    return this.encryptionType !== Encryption_Type.NONE;
  }

  getTrackPublication(source: Track.Source): LocalTrackPublication | undefined {
    const track = super.getTrackPublication(source);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  getTrackPublicationByName(name: string): LocalTrackPublication | undefined {
    const track = super.getTrackPublicationByName(name);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  /**
   * @internal
   */
  setupEngine(engine: RTCEngine) {
    this.engine = engine;
    this.engine.on(EngineEvent.RemoteMute, (trackSid: string, muted: boolean) => {
      const pub = this.trackPublications.get(trackSid);
      if (!pub || !pub.track) {
        return;
      }
      if (muted) {
        pub.mute();
      } else {
        pub.unmute();
      }
    });

    this.engine
      .on(EngineEvent.Connected, this.handleReconnected)
      .on(EngineEvent.SignalRestarted, this.handleReconnected)
      .on(EngineEvent.SignalResumed, this.handleReconnected)
      .on(EngineEvent.Restarting, this.handleReconnecting)
      .on(EngineEvent.Resuming, this.handleReconnecting)
      .on(EngineEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished)
      .on(EngineEvent.SubscribedQualityUpdate, this.handleSubscribedQualityUpdate)
      .on(EngineEvent.Disconnected, this.handleDisconnected);
  }

  private handleReconnecting = () => {
    if (!this.reconnectFuture) {
      this.reconnectFuture = new Future<void>();
    }
  };

  private handleReconnected = () => {
    this.reconnectFuture?.resolve?.();
    this.reconnectFuture = undefined;
    this.updateTrackSubscriptionPermissions();
  };

  private handleDisconnected = () => {
    if (this.reconnectFuture) {
      this.reconnectFuture.promise.catch((e) => this.log.warn(e.message, this.logContext));
      this.reconnectFuture?.reject?.('Got disconnected during reconnection attempt');
      this.reconnectFuture = undefined;
    }
  };

  /**
   * Sets and updates the metadata of the local participant.
   * The change does not take immediate effect.
   * If successful, a `ParticipantEvent.MetadataChanged` event will be emitted on the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission.
   * @param metadata
   */
  setMetadata(metadata: string): void {
    this.engine.client.sendUpdateLocalMetadata(metadata, this.name ?? '');
  }

  /**
   * Sets and updates the name of the local participant.
   * The change does not take immediate effect.
   * If successful, a `ParticipantEvent.ParticipantNameChanged` event will be emitted on the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission.
   * @param metadata
   */
  setName(name: string): void {
    this.engine.client.sendUpdateLocalMetadata(this.metadata ?? '', name);
  }

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
  ): Promise<LocalTrackPublication | undefined> {
    return this.setTrackEnabled(Track.Source.Camera, enabled, options, publishOptions);
  }

  /**
   * Enable or disable a participant's microphone track.
   *
   * If a track has already published, it'll mute or unmute the track.
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setMicrophoneEnabled(
    enabled: boolean,
    options?: AudioCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined> {
    return this.setTrackEnabled(Track.Source.Microphone, enabled, options, publishOptions);
  }

  /**
   * Start or stop sharing a participant's screen
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setScreenShareEnabled(
    enabled: boolean,
    options?: ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined> {
    return this.setTrackEnabled(Track.Source.ScreenShare, enabled, options, publishOptions);
  }

  /** @internal */
  setPermissions(permissions: ParticipantPermission): boolean {
    const prevPermissions = this.permissions;
    const changed = super.setPermissions(permissions);
    if (changed && prevPermissions) {
      this.emit(ParticipantEvent.ParticipantPermissionsChanged, prevPermissions);
    }
    return changed;
  }

  /** @internal */
  async setE2EEEnabled(enabled: boolean) {
    this.encryptionType = enabled ? Encryption_Type.GCM : Encryption_Type.NONE;
    await this.republishAllTracks(undefined, false);
  }

  /**
   * Enable or disable publishing for a track by source. This serves as a simple
   * way to manage the common tracks (camera, mic, or screen share).
   * Resolves with LocalTrackPublication if successful and void otherwise
   */
  private async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.Camera>,
    enabled: boolean,
    options?: VideoCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  private async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.Microphone>,
    enabled: boolean,
    options?: AudioCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  private async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.ScreenShare>,
    enabled: boolean,
    options?: ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  private async setTrackEnabled(
    source: Track.Source,
    enabled: true,
    options?: VideoCaptureOptions | AudioCaptureOptions | ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ) {
    this.log.debug('setTrackEnabled', { ...this.logContext, source, enabled });
    let track = this.getTrackPublication(source);
    if (enabled) {
      if (track) {
        await track.unmute();
      } else {
        let localTracks: Array<LocalTrack> | undefined;
        if (this.pendingPublishing.has(source)) {
          this.log.info('skipping duplicate published source', { ...this.logContext, source });
          // no-op it's already been requested
          return;
        }
        this.pendingPublishing.add(source);
        try {
          switch (source) {
            case Track.Source.Camera:
              localTracks = await this.createTracks({
                video: (options as VideoCaptureOptions | undefined) ?? true,
              });

              break;
            case Track.Source.Microphone:
              localTracks = await this.createTracks({
                audio: (options as AudioCaptureOptions | undefined) ?? true,
              });
              break;
            case Track.Source.ScreenShare:
              localTracks = await this.createScreenTracks({
                ...(options as ScreenShareCaptureOptions | undefined),
              });
              break;
            default:
              throw new TrackInvalidError(source);
          }
          const publishPromises: Array<Promise<LocalTrackPublication>> = [];
          for (const localTrack of localTracks) {
            this.log.info('publishing track', {
              ...this.logContext,
              ...getLogContextFromTrack(localTrack),
            });
            publishPromises.push(this.publishTrack(localTrack, publishOptions));
          }
          const publishedTracks = await Promise.all(publishPromises);
          // for screen share publications including audio, this will only return the screen share publication, not the screen share audio one
          // revisit if we want to return an array of tracks instead for v2
          [track] = publishedTracks;
        } catch (e) {
          localTracks?.forEach((tr) => {
            tr.stop();
          });
          if (e instanceof Error && !(e instanceof TrackInvalidError)) {
            this.emit(ParticipantEvent.MediaDevicesError, e);
          }
          throw e;
        } finally {
          this.pendingPublishing.delete(source);
        }
      }
    } else if (track && track.track) {
      // screenshare cannot be muted, unpublish instead
      if (source === Track.Source.ScreenShare) {
        track = await this.unpublishTrack(track.track);
        const screenAudioTrack = this.getTrackPublication(Track.Source.ScreenShareAudio);
        if (screenAudioTrack && screenAudioTrack.track) {
          this.unpublishTrack(screenAudioTrack.track);
        }
      } else {
        await track.mute();
      }
    }
    return track;
  }

  /**
   * Publish both camera and microphone at the same time. This is useful for
   * displaying a single Permission Dialog box to the end user.
   */
  async enableCameraAndMicrophone() {
    if (
      this.pendingPublishing.has(Track.Source.Camera) ||
      this.pendingPublishing.has(Track.Source.Microphone)
    ) {
      // no-op it's already been requested
      return;
    }

    this.pendingPublishing.add(Track.Source.Camera);
    this.pendingPublishing.add(Track.Source.Microphone);
    try {
      const tracks: LocalTrack[] = await this.createTracks({
        audio: true,
        video: true,
      });

      await Promise.all(tracks.map((track) => this.publishTrack(track)));
    } finally {
      this.pendingPublishing.delete(Track.Source.Camera);
      this.pendingPublishing.delete(Track.Source.Microphone);
    }
  }

  /**
   * Create local camera and/or microphone tracks
   * @param options
   * @returns
   */
  async createTracks(options?: CreateLocalTracksOptions): Promise<LocalTrack[]> {
    const mergedOptions = mergeDefaultOptions(
      options,
      this.roomOptions?.audioCaptureDefaults,
      this.roomOptions?.videoCaptureDefaults,
    );

    const constraints = constraintsForOptions(mergedOptions);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err instanceof Error) {
        if (constraints.audio) {
          this.microphoneError = err;
        }
        if (constraints.video) {
          this.cameraError = err;
        }
      }

      throw err;
    }

    if (constraints.audio) {
      this.microphoneError = undefined;
      this.emit(ParticipantEvent.AudioStreamAcquired);
    }
    if (constraints.video) {
      this.cameraError = undefined;
    }

    return Promise.all(
      stream.getTracks().map(async (mediaStreamTrack) => {
        const isAudio = mediaStreamTrack.kind === 'audio';
        let trackOptions = isAudio ? mergedOptions!.audio : mergedOptions!.video;
        if (typeof trackOptions === 'boolean' || !trackOptions) {
          trackOptions = {};
        }
        let trackConstraints: MediaTrackConstraints | undefined;
        const conOrBool = isAudio ? constraints.audio : constraints.video;
        if (typeof conOrBool !== 'boolean') {
          trackConstraints = conOrBool;
        }
        const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints, {
          loggerName: this.roomOptions.loggerName,
          loggerContextCb: () => this.logContext,
        });
        if (track.kind === Track.Kind.Video) {
          track.source = Track.Source.Camera;
        } else if (track.kind === Track.Kind.Audio) {
          track.source = Track.Source.Microphone;
          track.setAudioContext(this.audioContext);
        }
        track.mediaStream = stream;
        if (trackOptions.processor) {
          if (track instanceof LocalAudioTrack) {
            await track.setProcessor(trackOptions.processor as TrackProcessor<Track.Kind.Audio>);
          } else {
            await track.setProcessor(trackOptions.processor as TrackProcessor<Track.Kind.Video>);
          }
        }
        return track;
      }),
    );
  }

  /**
   * Creates a screen capture tracks with getDisplayMedia().
   * A LocalVideoTrack is always created and returned.
   * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
   */
  async createScreenTracks(options?: ScreenShareCaptureOptions): Promise<Array<LocalTrack>> {
    if (options === undefined) {
      options = {};
    }

    if (navigator.mediaDevices.getDisplayMedia === undefined) {
      throw new DeviceUnsupportedError('getDisplayMedia not supported');
    }

    if (options.resolution === undefined && !isSafari17()) {
      // we need to constrain the dimensions, otherwise it could lead to low bitrate
      // due to encoding a huge video. Encoding such large surfaces is really expensive
      // unfortunately Safari 17 has a but and cannot be constrained by default
      options.resolution = ScreenSharePresets.h1080fps30.resolution;
    }

    const constraints = screenCaptureToDisplayMediaStreamOptions(options);
    const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);

    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      throw new TrackInvalidError('no video track found');
    }
    const screenVideo = new LocalVideoTrack(tracks[0], undefined, false, {
      loggerName: this.roomOptions.loggerName,
      loggerContextCb: () => this.logContext,
    });
    screenVideo.source = Track.Source.ScreenShare;
    if (options.contentHint) {
      screenVideo.mediaStreamTrack.contentHint = options.contentHint;
    }

    const localTracks: Array<LocalTrack> = [screenVideo];
    if (stream.getAudioTracks().length > 0) {
      this.emit(ParticipantEvent.AudioStreamAcquired);
      const screenAudio = new LocalAudioTrack(
        stream.getAudioTracks()[0],
        undefined,
        false,
        this.audioContext,
        { loggerName: this.roomOptions.loggerName, loggerContextCb: () => this.logContext },
      );
      screenAudio.source = Track.Source.ScreenShareAudio;
      localTracks.push(screenAudio);
    }
    return localTracks;
  }

  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions,
  ): Promise<LocalTrackPublication> {
    if (track instanceof LocalAudioTrack) {
      track.setAudioContext(this.audioContext);
    }

    await this.reconnectFuture?.promise;
    if (track instanceof LocalTrack && this.pendingPublishPromises.has(track)) {
      await this.pendingPublishPromises.get(track);
    }
    let defaultConstraints: MediaTrackConstraints | undefined;
    if (track instanceof MediaStreamTrack) {
      defaultConstraints = track.getConstraints();
    } else {
      // we want to access constraints directly as `track.mediaStreamTrack`
      // might be pointing to a non-device track (e.g. processed track) already
      defaultConstraints = track.constraints;
      let deviceKind: MediaDeviceKind | undefined = undefined;
      switch (track.source) {
        case Track.Source.Microphone:
          deviceKind = 'audioinput';
          break;
        case Track.Source.Camera:
          deviceKind = 'videoinput';
        default:
          break;
      }
      if (deviceKind && this.activeDeviceMap.has(deviceKind)) {
        defaultConstraints = {
          ...defaultConstraints,
          deviceId: this.activeDeviceMap.get(deviceKind),
        };
      }
    }
    // convert raw media track into audio or video track
    if (track instanceof MediaStreamTrack) {
      switch (track.kind) {
        case 'audio':
          track = new LocalAudioTrack(track, defaultConstraints, true, this.audioContext, {
            loggerName: this.roomOptions.loggerName,
            loggerContextCb: () => this.logContext,
          });
          break;
        case 'video':
          track = new LocalVideoTrack(track, defaultConstraints, true, {
            loggerName: this.roomOptions.loggerName,
            loggerContextCb: () => this.logContext,
          });
          break;
        default:
          throw new TrackInvalidError(`unsupported MediaStreamTrack kind ${track.kind}`);
      }
    } else {
      track.updateLoggerOptions({
        loggerName: this.roomOptions.loggerName,
        loggerContextCb: () => this.logContext,
      });
    }

    // is it already published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.trackPublications.forEach((publication) => {
      if (!publication.track) {
        return;
      }
      if (publication.track === track) {
        existingPublication = <LocalTrackPublication>publication;
      }
    });

    if (existingPublication) {
      this.log.warn('track has already been published, skipping', {
        ...this.logContext,
        ...getLogContextFromTrack(existingPublication),
      });
      return existingPublication;
    }

    const isStereoInput =
      ('channelCount' in track.mediaStreamTrack.getSettings() &&
        // @ts-ignore `channelCount` on getSettings() is currently only available for Safari, but is generally the best way to determine a stereo track https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/channelCount
        track.mediaStreamTrack.getSettings().channelCount === 2) ||
      track.mediaStreamTrack.getConstraints().channelCount === 2;
    const isStereo = options?.forceStereo ?? isStereoInput;

    // disable dtx for stereo track if not enabled explicitly
    if (isStereo) {
      if (!options) {
        options = {};
      }
      if (options.dtx === undefined) {
        this.log.info(
          `Opus DTX will be disabled for stereo tracks by default. Enable them explicitly to make it work.`,
          {
            ...this.logContext,
            ...getLogContextFromTrack(track),
          },
        );
      }
      if (options.red === undefined) {
        this.log.info(
          `Opus RED will be disabled for stereo tracks by default. Enable them explicitly to make it work.`,
        );
      }
      options.dtx ??= false;
      options.red ??= false;
    }
    const opts: TrackPublishOptions = {
      ...this.roomOptions.publishDefaults,
      ...options,
    };

    if (!isE2EESimulcastSupported() && this.roomOptions.e2ee) {
      this.log.info(
        `End-to-end encryption is set up, simulcast publishing will be disabled on Safari versions and iOS browsers running iOS < v17.2`,
        {
          ...this.logContext,
        },
      );
      opts.simulcast = false;
    }

    if (opts.source) {
      track.source = opts.source;
    }
    const publishPromise = this.publish(track, opts, isStereo);
    this.pendingPublishPromises.set(track, publishPromise);
    try {
      const publication = await publishPromise;
      return publication;
    } catch (e) {
      throw e;
    } finally {
      this.pendingPublishPromises.delete(track);
    }
  }

  private async publish(track: LocalTrack, opts: TrackPublishOptions, isStereo: boolean) {
    const existingTrackOfSource = Array.from(this.trackPublications.values()).find(
      (publishedTrack) => track instanceof LocalTrack && publishedTrack.source === track.source,
    );
    if (existingTrackOfSource && track.source !== Track.Source.Unknown) {
      this.log.info(`publishing a second track with the same source: ${track.source}`, {
        ...this.logContext,
        ...getLogContextFromTrack(track),
      });
    }
    if (opts.stopMicTrackOnMute && track instanceof LocalAudioTrack) {
      track.stopOnMute = true;
    }

    if (track.source === Track.Source.ScreenShare && isFireFox()) {
      // Firefox does not work well with simulcasted screen share
      // we frequently get no data on layer 0 when enabled
      opts.simulcast = false;
    }

    // require full AV1/VP9 SVC support prior to using it
    if (opts.videoCodec === 'av1' && !supportsAV1()) {
      opts.videoCodec = undefined;
    }
    if (opts.videoCodec === 'vp9' && !supportsVP9()) {
      opts.videoCodec = undefined;
    }
    if (opts.videoCodec === undefined) {
      opts.videoCodec = defaultVideoCodec;
    }
    const videoCodec = opts.videoCodec;

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.on(TrackEvent.Ended, this.handleTrackEnded);
    track.on(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
    track.on(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);
    track.on(TrackEvent.AudioTrackFeatureUpdate, this.onTrackFeatureUpdate);

    // create track publication from track
    const req = new AddTrackRequest({
      // get local track id for use during publishing
      cid: track.mediaStreamTrack.id,
      name: opts.name,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      disableDtx: !(opts.dtx ?? true),
      encryption: this.encryptionType,
      stereo: isStereo,
      disableRed: this.isE2EEEnabled || !(opts.red ?? true),
      stream: opts?.stream,
    });

    // compute encodings and layers for video
    let encodings: RTCRtpEncodingParameters[] | undefined;
    if (track.kind === Track.Kind.Video) {
      let dims: Track.Dimensions = {
        width: 0,
        height: 0,
      };
      try {
        dims = await track.waitForDimensions();
      } catch (e) {
        // use defaults, it's quite painful for congestion control without simulcast
        // so using default dims according to publish settings
        const defaultRes =
          this.roomOptions.videoCaptureDefaults?.resolution ?? VideoPresets.h720.resolution;
        dims = {
          width: defaultRes.width,
          height: defaultRes.height,
        };
        // log failure
        this.log.error('could not determine track dimensions, using defaults', {
          ...this.logContext,
          ...getLogContextFromTrack(track),
          dims,
        });
      }
      // width and height should be defined for video
      req.width = dims.width;
      req.height = dims.height;
      // for svc codecs, disable simulcast and use vp8 for backup codec
      if (track instanceof LocalVideoTrack) {
        if (isSVCCodec(videoCodec)) {
          if (track.source === Track.Source.ScreenShare) {
            // vp9 svc with screenshare cannot encode multiple spatial layers
            // doing so reduces publish resolution to minimal resolution
            opts.scalabilityMode = 'L1T3';
            // Chrome does not allow more than 5 fps with L1T3, and it has encoding bugs with L3T3
            // It has a different path for screenshare handling and it seems to be untested/buggy
            // As a workaround, we are setting contentHint to force it to go through the same
            // path as regular camera video. While this is not optimal, it delivers the performance
            // that we need
            if ('contentHint' in track.mediaStreamTrack) {
              track.mediaStreamTrack.contentHint = 'motion';
              this.log.info('forcing contentHint to motion for screenshare with SVC codecs', {
                ...this.logContext,
                ...getLogContextFromTrack(track),
              });
            }
          }
          // set scalabilityMode to 'L3T3_KEY' by default
          opts.scalabilityMode = opts.scalabilityMode ?? 'L3T3_KEY';
        }

        req.simulcastCodecs = [
          new SimulcastCodec({
            codec: videoCodec,
            cid: track.mediaStreamTrack.id,
          }),
        ];

        // set up backup
        if (opts.backupCodec === true) {
          opts.backupCodec = { codec: defaultVideoCodec };
        }
        if (
          opts.backupCodec &&
          videoCodec !== opts.backupCodec.codec &&
          // TODO remove this once e2ee is supported for backup codecs
          req.encryption === Encryption_Type.NONE
        ) {
          // multi-codec simulcast requires dynacast
          if (!this.roomOptions.dynacast) {
            this.roomOptions.dynacast = true;
          }
          req.simulcastCodecs.push(
            new SimulcastCodec({
              codec: opts.backupCodec.codec,
              cid: '',
            }),
          );
        }
      }

      encodings = computeVideoEncodings(
        track.source === Track.Source.ScreenShare,
        req.width,
        req.height,
        opts,
      );
      req.layers = videoLayersFromEncodings(
        req.width,
        req.height,
        encodings,
        isSVCCodec(opts.videoCodec),
      );
    } else if (track.kind === Track.Kind.Audio) {
      encodings = [
        {
          maxBitrate: opts.audioPreset?.maxBitrate,
          priority: opts.audioPreset?.priority ?? 'high',
          networkPriority: opts.audioPreset?.priority ?? 'high',
        },
      ];
    }

    if (!this.engine || this.engine.isClosed) {
      throw new UnexpectedConnectionState('cannot publish track when not connected');
    }

    const ti = await this.engine.addTrack(req);
    // server might not support the codec the client has requested, in that case, fallback
    // to a supported codec
    let primaryCodecMime: string | undefined;
    ti.codecs.forEach((codec) => {
      if (primaryCodecMime === undefined) {
        primaryCodecMime = codec.mimeType;
      }
    });
    if (primaryCodecMime && track.kind === Track.Kind.Video) {
      const updatedCodec = mimeTypeToVideoCodecString(primaryCodecMime);
      if (updatedCodec !== videoCodec) {
        this.log.debug('falling back to server selected codec', {
          ...this.logContext,
          ...getLogContextFromTrack(track),
          codec: updatedCodec,
        });
        opts.videoCodec = updatedCodec;

        // recompute encodings since bitrates/etc could have changed
        encodings = computeVideoEncodings(
          track.source === Track.Source.ScreenShare,
          req.width,
          req.height,
          opts,
        );
      }
    }

    const publication = new LocalTrackPublication(track.kind, ti, track, {
      loggerName: this.roomOptions.loggerName,
      loggerContextCb: () => this.logContext,
    });
    // save options for when it needs to be republished again
    publication.options = opts;
    track.sid = ti.sid;

    if (!this.engine.pcManager) {
      throw new UnexpectedConnectionState('pcManager is not ready');
    }
    this.log.debug(`publishing ${track.kind} with encodings`, {
      ...this.logContext,
      encodings,
      trackInfo: ti,
    });

    track.sender = await this.engine.createSender(track, opts, encodings);

    if (track instanceof LocalVideoTrack) {
      opts.degradationPreference ??= getDefaultDegradationPreference(track);
      track.setDegradationPreference(opts.degradationPreference);
    }

    if (encodings) {
      if (isFireFox() && track.kind === Track.Kind.Audio) {
        /* Refer to RFC https://datatracker.ietf.org/doc/html/rfc7587#section-6.1,
           livekit-server uses maxaveragebitrate=510000 in the answer sdp to permit client to
           publish high quality audio track. But firefox always uses this value as the actual
           bitrates, causing the audio bitrates to rise to 510Kbps in any stereo case unexpectedly.
           So the client need to modify maxaverragebitrates in answer sdp to user provided value to
           fix the issue.
         */
        let trackTransceiver: RTCRtpTransceiver | undefined = undefined;
        for (const transceiver of this.engine.pcManager.publisher.getTransceivers()) {
          if (transceiver.sender === track.sender) {
            trackTransceiver = transceiver;
            break;
          }
        }
        if (trackTransceiver) {
          this.engine.pcManager.publisher.setTrackCodecBitrate({
            transceiver: trackTransceiver,
            codec: 'opus',
            maxbr: encodings[0]?.maxBitrate ? encodings[0].maxBitrate / 1000 : 0,
          });
        }
      } else if (track.codec && isSVCCodec(track.codec) && encodings[0]?.maxBitrate) {
        this.engine.pcManager.publisher.setTrackCodecBitrate({
          cid: req.cid,
          codec: track.codec,
          maxbr: encodings[0].maxBitrate / 1000,
        });
      }
    }

    await this.engine.negotiate();

    if (track instanceof LocalVideoTrack) {
      track.startMonitor(this.engine.client);
    } else if (track instanceof LocalAudioTrack) {
      track.startMonitor();
    }

    this.addTrackPublication(publication);
    // send event for publication
    this.emit(ParticipantEvent.LocalTrackPublished, publication);
    return publication;
  }

  override get isLocal(): boolean {
    return true;
  }

  /** @internal
   * publish additional codec to existing track
   */
  async publishAdditionalCodecForTrack(
    track: LocalTrack | MediaStreamTrack,
    videoCodec: BackupVideoCodec,
    options?: TrackPublishOptions,
  ) {
    // TODO remove once e2ee is supported for backup tracks
    if (this.encryptionType !== Encryption_Type.NONE) {
      return;
    }

    // is it not published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.trackPublications.forEach((publication) => {
      if (!publication.track) {
        return;
      }
      if (publication.track === track) {
        existingPublication = <LocalTrackPublication>publication;
      }
    });
    if (!existingPublication) {
      throw new TrackInvalidError('track is not published');
    }

    if (!(track instanceof LocalVideoTrack)) {
      throw new TrackInvalidError('track is not a video track');
    }

    const opts: TrackPublishOptions = {
      ...this.roomOptions?.publishDefaults,
      ...options,
    };

    const encodings = computeTrackBackupEncodings(track, videoCodec, opts);
    if (!encodings) {
      this.log.info(
        `backup codec has been disabled, ignoring request to add additional codec for track`,
        {
          ...this.logContext,
          ...getLogContextFromTrack(track),
        },
      );
      return;
    }
    const simulcastTrack = track.addSimulcastTrack(videoCodec, encodings);
    if (!simulcastTrack) {
      return;
    }
    const req = new AddTrackRequest({
      cid: simulcastTrack.mediaStreamTrack.id,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      sid: track.sid,
      simulcastCodecs: [
        {
          codec: opts.videoCodec,
          cid: simulcastTrack.mediaStreamTrack.id,
        },
      ],
    });
    req.layers = videoLayersFromEncodings(req.width, req.height, encodings);

    if (!this.engine || this.engine.isClosed) {
      throw new UnexpectedConnectionState('cannot publish track when not connected');
    }

    const ti = await this.engine.addTrack(req);

    const transceiverInit: RTCRtpTransceiverInit = { direction: 'sendonly' };
    if (encodings) {
      transceiverInit.sendEncodings = encodings;
    }
    await this.engine.createSimulcastSender(track, simulcastTrack, opts, encodings);

    await this.engine.negotiate();
    this.log.debug(`published ${videoCodec} for track ${track.sid}`, {
      ...this.logContext,
      encodings,
      trackInfo: ti,
    });
  }

  async unpublishTrack(
    track: LocalTrack | MediaStreamTrack,
    stopOnUnpublish?: boolean,
  ): Promise<LocalTrackPublication | undefined> {
    if (track instanceof LocalTrack) {
      const publishPromise = this.pendingPublishPromises.get(track);
      if (publishPromise) {
        this.log.info('awaiting publish promise before attempting to unpublish', {
          ...this.logContext,
          ...getLogContextFromTrack(track),
        });
        await publishPromise;
      }
    }
    // look through all published tracks to find the right ones
    const publication = this.getPublicationForTrack(track);

    const pubLogContext = publication ? getLogContextFromTrack(publication) : undefined;

    this.log.debug('unpublishing track', {
      ...this.logContext,
      ...pubLogContext,
    });

    if (!publication || !publication.track) {
      this.log.warn('track was not unpublished because no publication was found', {
        ...this.logContext,
        ...pubLogContext,
      });
      return undefined;
    }

    track = publication.track;
    track.off(TrackEvent.Muted, this.onTrackMuted);
    track.off(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.off(TrackEvent.Ended, this.handleTrackEnded);
    track.off(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
    track.off(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);
    track.off(TrackEvent.AudioTrackFeatureUpdate, this.onTrackFeatureUpdate);

    if (stopOnUnpublish === undefined) {
      stopOnUnpublish = this.roomOptions?.stopLocalTrackOnUnpublish ?? true;
    }
    if (stopOnUnpublish) {
      track.stop();
    }

    let negotiationNeeded = false;
    const trackSender = track.sender;
    track.sender = undefined;
    if (
      this.engine.pcManager &&
      this.engine.pcManager.currentState < PCTransportState.FAILED &&
      trackSender
    ) {
      try {
        for (const transceiver of this.engine.pcManager.publisher.getTransceivers()) {
          // if sender is not currently sending (after replaceTrack(null))
          // removeTrack would have no effect.
          // to ensure we end up successfully removing the track, manually set
          // the transceiver to inactive
          if (transceiver.sender === trackSender) {
            transceiver.direction = 'inactive';
            negotiationNeeded = true;
          }
        }
        if (this.engine.removeTrack(trackSender)) {
          negotiationNeeded = true;
        }
        if (track instanceof LocalVideoTrack) {
          for (const [, trackInfo] of track.simulcastCodecs) {
            if (trackInfo.sender) {
              if (this.engine.removeTrack(trackInfo.sender)) {
                negotiationNeeded = true;
              }
              trackInfo.sender = undefined;
            }
          }
          track.simulcastCodecs.clear();
        }
      } catch (e) {
        this.log.warn('failed to unpublish track', {
          ...this.logContext,
          ...pubLogContext,
          error: e,
        });
      }
    }

    // remove from our maps
    this.trackPublications.delete(publication.trackSid);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTrackPublications.delete(publication.trackSid);
        break;
      case Track.Kind.Video:
        this.videoTrackPublications.delete(publication.trackSid);
        break;
      default:
        break;
    }

    this.emit(ParticipantEvent.LocalTrackUnpublished, publication);
    publication.setTrack(undefined);

    if (negotiationNeeded) {
      await this.engine.negotiate();
    }
    return publication;
  }

  async unpublishTracks(
    tracks: LocalTrack[] | MediaStreamTrack[],
  ): Promise<LocalTrackPublication[]> {
    const results = await Promise.all(tracks.map((track) => this.unpublishTrack(track)));
    return results.filter(
      (track) => track instanceof LocalTrackPublication,
    ) as LocalTrackPublication[];
  }

  async republishAllTracks(options?: TrackPublishOptions, restartTracks: boolean = true) {
    const localPubs: LocalTrackPublication[] = [];
    this.trackPublications.forEach((pub) => {
      if (pub.track) {
        if (options) {
          pub.options = { ...pub.options, ...options };
        }
        localPubs.push(pub);
      }
    });

    await Promise.all(
      localPubs.map(async (pub) => {
        const track = pub.track!;
        await this.unpublishTrack(track, false);
        if (
          restartTracks &&
          !track.isMuted &&
          track.source !== Track.Source.ScreenShare &&
          track.source !== Track.Source.ScreenShareAudio &&
          (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) &&
          !track.isUserProvided
        ) {
          // generally we need to restart the track before publishing, often a full reconnect
          // is necessary because computer had gone to sleep.
          this.log.debug('restarting existing track', {
            ...this.logContext,
            track: pub.trackSid,
          });
          await track.restartTrack();
        }
        await this.publishTrack(track, pub.options);
      }),
    );
  }

  /**
   * Publish a new data payload to the room. Data will be forwarded to each
   * participant in the room if the destination field in publishOptions is empty
   *
   * @param data Uint8Array of the payload. To send string data, use TextEncoder.encode
   * @param options optionally specify a `reliable`, `topic` and `destination`
   */
  async publishData(data: Uint8Array, options: DataPublishOptions = {}): Promise<void> {
    const kind = options.reliable ? DataPacket_Kind.RELIABLE : DataPacket_Kind.LOSSY;
    const destinationIdentities = options.destinationIdentities;
    const topic = options.topic;

    const packet = new DataPacket({
      kind: kind,
      value: {
        case: 'user',
        value: new UserPacket({
          participantIdentity: this.identity,
          payload: data,
          destinationIdentities,
          topic,
        }),
      },
    });

    await this.engine.sendDataPacket(packet, kind);
  }

  /**
   * Control who can subscribe to LocalParticipant's published tracks.
   *
   * By default, all participants can subscribe. This allows fine-grained control over
   * who is able to subscribe at a participant and track level.
   *
   * Note: if access is given at a track-level (i.e. both [allParticipantsAllowed] and
   * [ParticipantTrackPermission.allTracksAllowed] are false), any newer published tracks
   * will not grant permissions to any participants and will require a subsequent
   * permissions update to allow subscription.
   *
   * @param allParticipantsAllowed Allows all participants to subscribe all tracks.
   *  Takes precedence over [[participantTrackPermissions]] if set to true.
   *  By default this is set to true.
   * @param participantTrackPermissions Full list of individual permissions per
   *  participant/track. Any omitted participants will not receive any permissions.
   */
  setTrackSubscriptionPermissions(
    allParticipantsAllowed: boolean,
    participantTrackPermissions: ParticipantTrackPermission[] = [],
  ) {
    this.participantTrackPermissions = participantTrackPermissions;
    this.allParticipantsAllowedToSubscribe = allParticipantsAllowed;
    if (!this.engine.client.isDisconnected) {
      this.updateTrackSubscriptionPermissions();
    }
  }

  /** @internal */
  updateInfo(info: ParticipantInfo): boolean {
    if (info.sid !== this.sid) {
      // drop updates that specify a wrong sid.
      // the sid for local participant is only explicitly set on join and full reconnect
      return false;
    }
    if (!super.updateInfo(info)) {
      return false;
    }

    // reconcile track mute status.
    // if server's track mute status doesn't match actual, we'll have to update
    // the server's copy
    info.tracks.forEach((ti) => {
      const pub = this.trackPublications.get(ti.sid);

      if (pub) {
        const mutedOnServer = pub.isMuted || (pub.track?.isUpstreamPaused ?? false);
        if (mutedOnServer !== ti.muted) {
          this.log.debug('updating server mute state after reconcile', {
            ...this.logContext,
            ...getLogContextFromTrack(pub),
            mutedOnServer,
          });
          this.engine.client.sendMuteTrack(ti.sid, mutedOnServer);
        }
      }
    });
    return true;
  }

  private updateTrackSubscriptionPermissions = () => {
    this.log.debug('updating track subscription permissions', {
      ...this.logContext,
      allParticipantsAllowed: this.allParticipantsAllowedToSubscribe,
      participantTrackPermissions: this.participantTrackPermissions,
    });
    this.engine.client.sendUpdateSubscriptionPermissions(
      this.allParticipantsAllowedToSubscribe,
      this.participantTrackPermissions.map((p) => trackPermissionToProto(p)),
    );
  };

  /** @internal */
  private onTrackUnmuted = (track: LocalTrack) => {
    this.onTrackMuted(track, track.isUpstreamPaused);
  };

  // when the local track changes in mute status, we'll notify server as such
  /** @internal */
  private onTrackMuted = (track: LocalTrack, muted?: boolean) => {
    if (muted === undefined) {
      muted = true;
    }

    if (!track.sid) {
      this.log.error('could not update mute status for unpublished track', {
        ...this.logContext,
        ...getLogContextFromTrack(track),
      });
      return;
    }

    this.engine.updateMuteStatus(track.sid, muted);
  };

  private onTrackUpstreamPaused = (track: LocalTrack) => {
    this.log.debug('upstream paused', {
      ...this.logContext,
      ...getLogContextFromTrack(track),
    });
    this.onTrackMuted(track, true);
  };

  private onTrackUpstreamResumed = (track: LocalTrack) => {
    this.log.debug('upstream resumed', {
      ...this.logContext,
      ...getLogContextFromTrack(track),
    });
    this.onTrackMuted(track, track.isMuted);
  };

  private onTrackFeatureUpdate = (track: LocalAudioTrack) => {
    const pub = this.audioTrackPublications.get(track.sid!);
    if (!pub) {
      this.log.warn(
        `Could not update local audio track settings, missing publication for track ${track.sid}`,
        this.logContext,
      );
      return;
    }
    this.engine.client.sendUpdateLocalAudioTrack(pub.trackSid, pub.getTrackFeatures());
  };

  private handleSubscribedQualityUpdate = async (update: SubscribedQualityUpdate) => {
    if (!this.roomOptions?.dynacast) {
      return;
    }
    const pub = this.videoTrackPublications.get(update.trackSid);
    if (!pub) {
      this.log.warn('received subscribed quality update for unknown track', {
        ...this.logContext,
        trackSid: update.trackSid,
      });
      return;
    }
    if (update.subscribedCodecs.length > 0) {
      if (!pub.videoTrack) {
        return;
      }
      const newCodecs = await pub.videoTrack.setPublishingCodecs(update.subscribedCodecs);
      for await (const codec of newCodecs) {
        if (isBackupCodec(codec)) {
          this.log.debug(`publish ${codec} for ${pub.videoTrack.sid}`, {
            ...this.logContext,
            ...getLogContextFromTrack(pub),
          });
          await this.publishAdditionalCodecForTrack(pub.videoTrack, codec, pub.options);
        }
      }
    } else if (update.subscribedQualities.length > 0) {
      await pub.videoTrack?.setPublishingLayers(update.subscribedQualities);
    }
  };

  private handleLocalTrackUnpublished = (unpublished: TrackUnpublishedResponse) => {
    const track = this.trackPublications.get(unpublished.trackSid);
    if (!track) {
      this.log.warn('received unpublished event for unknown track', {
        ...this.logContext,
        trackSid: unpublished.trackSid,
      });
      return;
    }
    this.unpublishTrack(track.track!);
  };

  private handleTrackEnded = async (track: LocalTrack) => {
    if (
      track.source === Track.Source.ScreenShare ||
      track.source === Track.Source.ScreenShareAudio
    ) {
      this.log.debug('unpublishing local track due to TrackEnded', {
        ...this.logContext,
        ...getLogContextFromTrack(track),
      });
      this.unpublishTrack(track);
    } else if (track.isUserProvided) {
      await track.mute();
    } else if (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) {
      try {
        if (isWeb()) {
          try {
            const currentPermissions = await navigator?.permissions.query({
              // the permission query for camera and microphone currently not supported in Safari and Firefox
              // @ts-ignore
              name: track.source === Track.Source.Camera ? 'camera' : 'microphone',
            });
            if (currentPermissions && currentPermissions.state === 'denied') {
              this.log.warn(`user has revoked access to ${track.source}`, {
                ...this.logContext,
                ...getLogContextFromTrack(track),
              });

              // detect granted change after permissions were denied to try and resume then
              currentPermissions.onchange = () => {
                if (currentPermissions.state !== 'denied') {
                  if (!track.isMuted) {
                    track.restartTrack();
                  }
                  currentPermissions.onchange = null;
                }
              };
              throw new Error('GetUserMedia Permission denied');
            }
          } catch (e: any) {
            // permissions query fails for firefox, we continue and try to restart the track
          }
        }
        if (!track.isMuted) {
          this.log.debug('track ended, attempting to use a different device', {
            ...this.logContext,
            ...getLogContextFromTrack(track),
          });
          await track.restartTrack();
        }
      } catch (e) {
        this.log.warn(`could not restart track, muting instead`, {
          ...this.logContext,
          ...getLogContextFromTrack(track),
        });
        await track.mute();
      }
    }
  };

  private getPublicationForTrack(
    track: LocalTrack | MediaStreamTrack,
  ): LocalTrackPublication | undefined {
    let publication: LocalTrackPublication | undefined;
    this.trackPublications.forEach((pub) => {
      const localTrack = pub.track;
      if (!localTrack) {
        return;
      }

      // this looks overly complicated due to this object tree
      if (track instanceof MediaStreamTrack) {
        if (localTrack instanceof LocalAudioTrack || localTrack instanceof LocalVideoTrack) {
          if (localTrack.mediaStreamTrack === track) {
            publication = <LocalTrackPublication>pub;
          }
        }
      } else if (track === localTrack) {
        publication = <LocalTrackPublication>pub;
      }
    });
    return publication;
  }
}
