import log from '../../logger';
import type { InternalRoomOptions } from '../../options';
import {
  DataPacket,
  DataPacket_Kind,
  Encryption_Type,
  ParticipantInfo,
  ParticipantPermission,
} from '../../proto/livekit_models';
import {
  AddTrackRequest,
  DataChannelInfo,
  SignalTarget,
  SubscribedQualityUpdate,
  TrackPublishedResponse,
  TrackUnpublishedResponse,
} from '../../proto/livekit_rtc';
import type RTCEngine from '../RTCEngine';
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
import { ScreenSharePresets, VideoPresets, isBackupCodec, isCodecEqual } from '../track/options';
import { constraintsForOptions, mergeDefaultOptions } from '../track/utils';
import type { DataPublishOptions } from '../types';
import { Future, isFireFox, isSVCCodec, isSafari, isWeb, supportsAV1, supportsVP9 } from '../utils';
import Participant from './Participant';
import type { ParticipantTrackPermission } from './ParticipantTrackPermission';
import { trackPermissionToProto } from './ParticipantTrackPermission';
import RemoteParticipant from './RemoteParticipant';
import {
  computeTrackBackupEncodings,
  computeVideoEncodings,
  mediaTrackToLocalTrack,
} from './publishUtils';

export default class LocalParticipant extends Participant {
  audioTracks: Map<string, LocalTrackPublication>;

  videoTracks: Map<string, LocalTrackPublication>;

  /** map of track sid => all published tracks */
  tracks: Map<string, LocalTrackPublication>;

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
    super(sid, identity);
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
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

  getTrack(source: Track.Source): LocalTrackPublication | undefined {
    const track = super.getTrack(source);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  getTrackByName(name: string): LocalTrackPublication | undefined {
    const track = super.getTrackByName(name);
    if (track) {
      return track as LocalTrackPublication;
    }
  }

  /**
   * @internal
   */
  setupEngine(engine: RTCEngine) {
    this.engine = engine;
    this.engine.client.onRemoteMuteChanged = (trackSid: string, muted: boolean) => {
      const pub = this.tracks.get(trackSid);
      if (!pub || !pub.track) {
        return;
      }
      if (muted) {
        pub.mute();
      } else {
        pub.unmute();
      }
    };

    this.engine.client.onSubscribedQualityUpdate = this.handleSubscribedQualityUpdate;

    this.engine.client.onLocalTrackUnpublished = this.handleLocalTrackUnpublished;

    this.engine
      .on(EngineEvent.Connected, this.handleReconnected)
      .on(EngineEvent.Restarted, this.handleReconnected)
      .on(EngineEvent.Resumed, this.handleReconnected)
      .on(EngineEvent.Restarting, this.handleReconnecting)
      .on(EngineEvent.Resuming, this.handleReconnecting)
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
      this.reconnectFuture.promise.catch((e) => log.warn(e));
      this.reconnectFuture?.reject?.('Got disconnected during reconnection attempt');
      this.reconnectFuture = undefined;
    }
  };

  /**
   * Sets and updates the metadata of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission encoded in the token.
   * @param metadata
   */
  setMetadata(metadata: string): void {
    super.setMetadata(metadata);
    this.engine.client.sendUpdateLocalMetadata(metadata, this.name ?? '');
  }

  /**
   * Sets and updates the name of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission encoded in the token.
   * @param metadata
   */
  setName(name: string): void {
    super.setName(name);
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
    log.debug('setTrackEnabled', { source, enabled });
    let track = this.getTrack(source);
    if (enabled) {
      if (track) {
        await track.unmute();
      } else {
        let localTracks: Array<LocalTrack> | undefined;
        if (this.pendingPublishing.has(source)) {
          log.info('skipping duplicate published source', { source });
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
            log.info('publishing track', { localTrack });
            publishPromises.push(this.publishTrack(localTrack, publishOptions));
          }
          const publishedTracks = await Promise.all(publishPromises);
          // for screen share publications including audio, this will only return the screen share publication, not the screen share audio one
          // revisit if we want to return an array of tracks instead for v2
          [track] = publishedTracks;
        } catch (e) {
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
        const screenAudioTrack = this.getTrack(Track.Source.ScreenShareAudio);
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
    const opts = mergeDefaultOptions(
      options,
      this.roomOptions?.audioCaptureDefaults,
      this.roomOptions?.videoCaptureDefaults,
    );

    const constraints = constraintsForOptions(opts);
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
    }
    if (constraints.video) {
      this.cameraError = undefined;
    }

    return stream.getTracks().map((mediaStreamTrack) => {
      const isAudio = mediaStreamTrack.kind === 'audio';
      let trackOptions = isAudio ? options!.audio : options!.video;
      if (typeof trackOptions === 'boolean' || !trackOptions) {
        trackOptions = {};
      }
      let trackConstraints: MediaTrackConstraints | undefined;
      const conOrBool = isAudio ? constraints.audio : constraints.video;
      if (typeof conOrBool !== 'boolean') {
        trackConstraints = conOrBool;
      }
      const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
      if (track.kind === Track.Kind.Video) {
        track.source = Track.Source.Camera;
      } else if (track.kind === Track.Kind.Audio) {
        track.source = Track.Source.Microphone;
      }
      track.mediaStream = stream;
      return track;
    });
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
    if (options.resolution === undefined) {
      options.resolution = ScreenSharePresets.h1080fps15.resolution;
    }

    let videoConstraints: MediaTrackConstraints | boolean = true;
    if (options.resolution) {
      if (isSafari()) {
        videoConstraints = {
          width: { max: options.resolution.width },
          height: { max: options.resolution.height },
          frameRate: options.resolution.frameRate,
        };
      } else {
        videoConstraints = {
          width: { ideal: options.resolution.width },
          height: { ideal: options.resolution.height },
          frameRate: options.resolution.frameRate,
        };
      }
    }

    if (navigator.mediaDevices.getDisplayMedia === undefined) {
      throw new DeviceUnsupportedError('getDisplayMedia not supported');
    }

    const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: options.audio ?? false,
      video: videoConstraints,
      // @ts-expect-error support for experimental display media features
      controller: options.controller,
      selfBrowserSurface: options.selfBrowserSurface,
      surfaceSwitching: options.surfaceSwitching,
      systemAudio: options.systemAudio,
    });

    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      throw new TrackInvalidError('no video track found');
    }
    const screenVideo = new LocalVideoTrack(tracks[0], undefined, false);
    screenVideo.source = Track.Source.ScreenShare;
    const localTracks: Array<LocalTrack> = [screenVideo];
    if (stream.getAudioTracks().length > 0) {
      const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0], undefined, false);
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
          track = new LocalAudioTrack(track, defaultConstraints, true);
          break;
        case 'video':
          track = new LocalVideoTrack(track, defaultConstraints, true);
          break;
        default:
          throw new TrackInvalidError(`unsupported MediaStreamTrack kind ${track.kind}`);
      }
    }

    // is it already published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.tracks.forEach((publication) => {
      if (!publication.track) {
        return;
      }
      if (publication.track === track) {
        existingPublication = <LocalTrackPublication>publication;
      }
    });

    if (existingPublication) {
      log.warn('track has already been published, skipping');
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
        log.info(
          `Opus DTX will be disabled for stereo tracks by default. Enable them explicitly to make it work.`,
        );
      }
      if (options.red === undefined) {
        log.info(
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

    // disable simulcast if e2ee is set on safari
    if (isSafari() && this.roomOptions.e2ee) {
      log.info(`End-to-end encryption is set up, simulcast publishing will be disabled on Safari`);
      opts.simulcast = false;
    }

    if (opts.source) {
      track.source = opts.source;
    }
    const publishPromise = this.publish(track, opts, options, isStereo);
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

  private async publish(
    track: LocalTrack,
    opts: TrackPublishOptions,
    options: TrackPublishOptions | undefined,
    isStereo: boolean,
  ) {
    const existingTrackOfSource = Array.from(this.tracks.values()).find(
      (publishedTrack) => track instanceof LocalTrack && publishedTrack.source === track.source,
    );
    if (existingTrackOfSource && track.source !== Track.Source.Unknown) {
      try {
        // throw an Error in order to capture the stack trace
        throw Error(`publishing a second track with the same source: ${track.source}`);
      } catch (e: unknown) {
        if (e instanceof Error) {
          log.warn(e.message, {
            oldTrack: existingTrackOfSource,
            newTrack: track,
            trace: e.stack,
          });
        }
      }
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

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.on(TrackEvent.Ended, this.handleTrackEnded);
    track.on(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
    track.on(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);

    // create track publication from track
    const req = AddTrackRequest.fromPartial({
      // get local track id for use during publishing
      cid: track.mediaStreamTrack.id,
      name: options?.name,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      disableDtx: !(opts.dtx ?? true),
      encryption: this.encryptionType,
      stereo: isStereo,
      // disableRed: !(opts.red ?? true),
    });

    // compute encodings and layers for video
    let encodings: RTCRtpEncodingParameters[] | undefined;
    let simEncodings: RTCRtpEncodingParameters[] | undefined;
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
        log.error('could not determine track dimensions, using defaults', dims);
      }
      // width and height should be defined for video
      req.width = dims.width;
      req.height = dims.height;
      // for svc codecs, disable simulcast and use vp8 for backup codec
      if (track instanceof LocalVideoTrack) {
        if (isSVCCodec(opts.videoCodec)) {
          // set scalabilityMode to 'L3T3_KEY' by default
          opts.scalabilityMode = opts.scalabilityMode ?? 'L3T3_KEY';
        }

        // set up backup
        if (opts.videoCodec && opts.backupCodec && opts.videoCodec !== opts.backupCodec.codec) {
          const simOpts = { ...opts };
          simOpts.simulcast = true;
          simEncodings = computeTrackBackupEncodings(track, opts.backupCodec.codec, simOpts);

          req.simulcastCodecs = [
            {
              codec: opts.videoCodec,
              cid: track.mediaStreamTrack.id,
              enableSimulcastLayers: true,
            },
            {
              codec: opts.backupCodec.codec,
              cid: '',
              enableSimulcastLayers: true,
            },
          ];
        } else if (opts.videoCodec) {
          // pass codec info to sfu so it can prefer codec for the client which don't support
          // setCodecPreferences
          req.simulcastCodecs = [
            {
              codec: opts.videoCodec,
              cid: track.mediaStreamTrack.id,
              enableSimulcastLayers: opts.simulcast ?? false,
            },
          ];
        }
      }

      encodings = computeVideoEncodings(
        track.source === Track.Source.ScreenShare,
        dims.width,
        dims.height,
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
          maxBitrate: opts.audioPreset?.maxBitrate ?? opts.audioBitrate,
          priority: opts.audioPreset?.priority ?? 'high',
          networkPriority: opts.audioPreset?.priority ?? 'high',
        },
      ];
    }

    if (!this.engine || this.engine.isClosed) {
      throw new UnexpectedConnectionState('cannot publish track when not connected');
    }

    const ti = await this.engine.addTrack(req);
    let primaryCodecSupported = false;
    let backupCodecSupported = false;
    ti.codecs.forEach((c) => {
      if (isCodecEqual(c.mimeType, opts.videoCodec)) {
        primaryCodecSupported = true;
      } else if (opts.backupCodec && isCodecEqual(c.mimeType, opts.backupCodec.codec)) {
        backupCodecSupported = true;
      }
    });

    if (req.simulcastCodecs.length > 0) {
      if (!primaryCodecSupported && !backupCodecSupported) {
        throw Error('cannot publish track, codec not supported by server');
      }

      if (!primaryCodecSupported && opts.backupCodec) {
        const backupCodec = opts.backupCodec;
        opts = { ...opts };
        log.debug(
          `primary codec ${opts.videoCodec} not supported, fallback to ${backupCodec.codec}`,
        );
        opts.videoCodec = backupCodec.codec;
        opts.videoEncoding = backupCodec.encoding;
        encodings = simEncodings;
      }
    }

    const publication = new LocalTrackPublication(track.kind, ti, track);
    // save options for when it needs to be republished again
    publication.options = opts;
    track.sid = ti.sid;

    if (!this.engine.publisher) {
      throw new UnexpectedConnectionState('publisher is closed');
    }
    log.debug(`publishing ${track.kind} with encodings`, { encodings, trackInfo: ti });

    // store RTPSender
    track.sender = await this.engine.createSender(track, opts, encodings);

    if (encodings) {
      if (isFireFox() && track.kind === Track.Kind.Audio) {
        /* Refer to RFC https://datatracker.ietf.org/doc/html/rfc7587#section-6.1,
           livekit-server uses maxaveragebitrate=510000in the answer sdp to permit client to
           publish high quality audio track. But firefox always uses this value as the actual
           bitrates, causing the audio bitrates to rise to 510Kbps in any stereo case unexpectedly.
           So the client need to modify maxaverragebitrates in answer sdp to user provided value to
           fix the issue.
         */
        let trackTransceiver: RTCRtpTransceiver | undefined = undefined;
        for (const transceiver of this.engine.publisher.pc.getTransceivers()) {
          if (transceiver.sender === track.sender) {
            trackTransceiver = transceiver;
            break;
          }
        }
        if (trackTransceiver) {
          this.engine.publisher.setTrackCodecBitrate({
            transceiver: trackTransceiver,
            codec: 'opus',
            maxbr: encodings[0]?.maxBitrate ? encodings[0].maxBitrate / 1000 : 0,
          });
        }
      } else if (track.codec && isSVCCodec(track.codec) && encodings[0]?.maxBitrate) {
        this.engine.publisher.setTrackCodecBitrate({
          cid: req.cid,
          codec: track.codec,
          maxbr: encodings[0].maxBitrate / 1000,
        });
      }
    }

    this.engine.negotiate();

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
    // is it not published? if so skip
    let existingPublication: LocalTrackPublication | undefined;
    this.tracks.forEach((publication) => {
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
      log.info(
        `backup codec has been disabled, ignoring request to add additional codec for track`,
      );
      return;
    }
    const simulcastTrack = track.addSimulcastTrack(videoCodec, encodings);
    const req = AddTrackRequest.fromPartial({
      cid: simulcastTrack.mediaStreamTrack.id,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      sid: track.sid,
      simulcastCodecs: [
        {
          codec: opts.videoCodec,
          cid: simulcastTrack.mediaStreamTrack.id,
          enableSimulcastLayers: opts.simulcast,
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

    this.engine.negotiate();
    log.debug(`published ${videoCodec} for track ${track.sid}`, { encodings, trackInfo: ti });
  }

  async unpublishTrack(
    track: LocalTrack | MediaStreamTrack,
    stopOnUnpublish?: boolean,
  ): Promise<LocalTrackPublication | undefined> {
    // look through all published tracks to find the right ones
    const publication = this.getPublicationForTrack(track);

    log.debug('unpublishing track', { track, method: 'unpublishTrack' });

    if (!publication || !publication.track) {
      log.warn('track was not unpublished because no publication was found', {
        track,
        method: 'unpublishTrack',
      });
      return undefined;
    }

    track = publication.track;
    track.off(TrackEvent.Muted, this.onTrackMuted);
    track.off(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.off(TrackEvent.Ended, this.handleTrackEnded);
    track.off(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
    track.off(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);

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
      this.engine.publisher &&
      this.engine.publisher.pc.connectionState !== 'closed' &&
      trackSender
    ) {
      try {
        for (const transceiver of this.engine.publisher.pc.getTransceivers()) {
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
        log.warn('failed to unpublish track', { error: e, method: 'unpublishTrack' });
      }
    }

    // remove from our maps
    this.tracks.delete(publication.trackSid);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.delete(publication.trackSid);
        break;
      case Track.Kind.Video:
        this.videoTracks.delete(publication.trackSid);
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
    this.tracks.forEach((pub) => {
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
          (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) &&
          !track.isUserProvided
        ) {
          // generally we need to restart the track before publishing, often a full reconnect
          // is necessary because computer had gone to sleep.
          log.debug('restarting existing track', {
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
   * @param kind whether to send this as reliable or lossy.
   * For data that you need delivery guarantee (such as chat messages), use Reliable.
   * For data that should arrive as quickly as possible, but you are ok with dropped
   * packets, use Lossy.
   * @param publishOptions optionally specify a `topic` and `destination`
   */
  async publishData(
    data: Uint8Array,
    kind: DataPacket_Kind,
    publishOptions?: DataPublishOptions,
  ): Promise<void>;
  /**
   * Publish a new data payload to the room. Data will be forwarded to each
   * participant in the room if the destination argument is empty
   *
   * @param data Uint8Array of the payload. To send string data, use TextEncoder.encode
   * @param kind whether to send this as reliable or lossy.
   * For data that you need delivery guarantee (such as chat messages), use Reliable.
   * For data that should arrive as quickly as possible, but you are ok with dropped
   * packets, use Lossy.
   * @param destination the participants who will receive the message
   */
  async publishData(
    data: Uint8Array,
    kind: DataPacket_Kind,
    destination?: RemoteParticipant[] | string[],
  ): Promise<void>;

  async publishData(
    data: Uint8Array,
    kind: DataPacket_Kind,
    publishOptions: DataPublishOptions | RemoteParticipant[] | string[] = {},
  ) {
    const destination = Array.isArray(publishOptions)
      ? publishOptions
      : publishOptions?.destination;
    const destinationSids: string[] = [];

    const topic = !Array.isArray(publishOptions) ? publishOptions.topic : undefined;

    if (destination !== undefined) {
      destination.forEach((val: any) => {
        if (val instanceof RemoteParticipant) {
          destinationSids.push(val.sid);
        } else {
          destinationSids.push(val);
        }
      });
    }

    const packet: DataPacket = {
      kind,
      value: {
        $case: 'user',
        user: {
          participantSid: this.sid,
          payload: data,
          destinationSids: destinationSids,
          topic,
        },
      },
    };

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
    if (this.engine.client.isConnected) {
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
      const pub = this.tracks.get(ti.sid);

      if (pub) {
        const mutedOnServer = pub.isMuted || (pub.track?.isUpstreamPaused ?? false);
        if (mutedOnServer !== ti.muted) {
          log.debug('updating server mute state after reconcile', {
            sid: ti.sid,
            muted: mutedOnServer,
          });
          this.engine.client.sendMuteTrack(ti.sid, mutedOnServer);
        }
      }
    });
    return true;
  }

  private updateTrackSubscriptionPermissions = () => {
    log.debug('updating track subscription permissions', {
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
      log.error('could not update mute status for unpublished track', track);
      return;
    }

    this.engine.updateMuteStatus(track.sid, muted);
  };

  private onTrackUpstreamPaused = (track: LocalTrack) => {
    log.debug('upstream paused');
    this.onTrackMuted(track, true);
  };

  private onTrackUpstreamResumed = (track: LocalTrack) => {
    log.debug('upstream resumed');
    this.onTrackMuted(track, track.isMuted);
  };

  private handleSubscribedQualityUpdate = async (update: SubscribedQualityUpdate) => {
    if (!this.roomOptions?.dynacast) {
      return;
    }
    const pub = this.videoTracks.get(update.trackSid);
    if (!pub) {
      log.warn('received subscribed quality update for unknown track', {
        method: 'handleSubscribedQualityUpdate',
        sid: update.trackSid,
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
          log.debug(`publish ${codec} for ${pub.videoTrack.sid}`);
          await this.publishAdditionalCodecForTrack(pub.videoTrack, codec, pub.options);
        }
      }
    } else if (update.subscribedQualities.length > 0) {
      await pub.videoTrack?.setPublishingLayers(update.subscribedQualities);
    }
  };

  private handleLocalTrackUnpublished = (unpublished: TrackUnpublishedResponse) => {
    const track = this.tracks.get(unpublished.trackSid);
    if (!track) {
      log.warn('received unpublished event for unknown track', {
        method: 'handleLocalTrackUnpublished',
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
      log.debug('unpublishing local track due to TrackEnded', {
        track: track.sid,
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
              log.warn(`user has revoked access to ${track.source}`);

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
          log.debug('track ended, attempting to use a different device');
          await track.restartTrack();
        }
      } catch (e) {
        log.warn(`could not restart track, muting instead`);
        await track.mute();
      }
    }
  };

  private getPublicationForTrack(
    track: LocalTrack | MediaStreamTrack,
  ): LocalTrackPublication | undefined {
    let publication: LocalTrackPublication | undefined;
    this.tracks.forEach((pub) => {
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

  /** @internal */
  publishedTracksInfo(): TrackPublishedResponse[] {
    const infos: TrackPublishedResponse[] = [];
    this.tracks.forEach((track: LocalTrackPublication) => {
      if (track.track !== undefined) {
        infos.push({
          cid: track.track.mediaStreamID,
          track: track.trackInfo,
        });
      }
    });
    return infos;
  }

  /** @internal */
  dataChannelsInfo(): DataChannelInfo[] {
    const infos: DataChannelInfo[] = [];
    const getInfo = (dc: RTCDataChannel | undefined, target: SignalTarget) => {
      if (dc?.id !== undefined && dc.id !== null) {
        infos.push({
          label: dc.label,
          id: dc.id,
          target,
        });
      }
    };
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.LOSSY), SignalTarget.PUBLISHER);
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.RELIABLE), SignalTarget.PUBLISHER);
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.LOSSY, true), SignalTarget.SUBSCRIBER);
    getInfo(
      this.engine.dataChannelForKind(DataPacket_Kind.RELIABLE, true),
      SignalTarget.SUBSCRIBER,
    );
    return infos;
  }
}
