import { Mutex } from '@livekit/mutex';
import {
  AddTrackRequest,
  AudioTrackFeature,
  BackupCodecPolicy,
  Codec,
  DataPacket,
  DataPacket_Kind,
  Encryption_Type,
  JoinResponse,
  PacketTrailerFeature,
  ParticipantInfo,
  RequestResponse,
  RequestResponse_Reason,
  SipDTMF,
  TrackInfo,
  TrackUnpublishedResponse,
  UserPacket,
} from '@livekit/protocol';
import { SignalConnectionState } from '../../api/SignalClient';
import {
  getFrameMetadataFeatures,
  getFrameMetadataPublishOptions,
  hasFrameMetadataPublishOptions,
  isFrameMetadataSupported,
} from '../../frameMetadata/utils';
import type { InternalRoomOptions } from '../../options';
import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import TypedPromise from '../../utils/TypedPromise';
import { PCTransportState } from '../PCTransportManager';
import type RTCEngine from '../RTCEngine';
import { DataChannelKind } from '../RTCEngine';
import type { ByteStreamWriter } from '../data-stream/outgoing/StreamWriter';
import {
  LivekitError,
  NegotiationError,
  PublishTrackError,
  SignalRequestError,
  TrackInvalidError,
  UnexpectedConnectionState,
} from '../errors';
import { EngineEvent, ParticipantEvent, TrackEvent } from '../events';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalTrack from '../track/LocalTrack';
import LocalTrackPublication from '../track/LocalTrackPublication';
import type LocalVideoTrack from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import { createLocalTracks, getVideoCapture } from '../track/create';
import type {
  AudioCaptureOptions,
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from '../track/options';
import {
  getLogContextFromTrack,
  getTrackSourceFromProto,
  mergeDefaultOptions,
  sourceToKind,
} from '../track/utils';
import { type DataPublishOptions, type StreamBytesOptions } from '../types';
import {
  Future,
  isAudioTrack,
  isFireFox,
  isLocalAudioTrack,
  isLocalTrack,
  isLocalVideoTrack,
  isVideoTrack,
  isWeb,
  sleep,
} from '../utils';
import Participant from './Participant';
import type { ParticipantTrackPermission } from './ParticipantTrackPermission';
import { trackPermissionToProto } from './ParticipantTrackPermission';
import type RemoteParticipant from './RemoteParticipant';

/**
 * What extensions plug into the local participant. The room owns the object and fills it through
 * `ExtensionContext.setLocalParticipantSlot()`; the participant only reads it.
 * @internal
 */
export interface LocalParticipantSlots {
  /** Opens an outgoing byte stream (`dataStreams`). The preconnect audio buffer goes through it. */
  openByteStream?: (options?: StreamBytesOptions) => Promise<ByteStreamWriter>;
  /** The video publish pipeline (`video`). Without it, publishing a video track throws. */
  videoPublisher?: VideoPublisher;
}

/**
 * The video publish pipeline. The `video` extension sets it on the local participant; without it,
 * publishing a video track throws.
 * @internal
 */
export interface VideoPublisher {
  /**
   * Chooses the codec, settles simulcast and SVC and fills `req` (dimensions, layers, codecs).
   * Returns the encodings for the sender.
   */
  prepare(
    track: LocalVideoTrack,
    opts: TrackPublishOptions,
    req: AddTrackRequest,
  ): Promise<RTCRtpEncodingParameters[]>;
  /** Runs once the sender exists: degradation preference and start bitrate. */
  senderCreated(
    track: LocalVideoTrack,
    opts: TrackPublishOptions,
    encodings: RTCRtpEncodingParameters[] | undefined,
    req: AddTrackRequest,
  ): void;
  /** The server may answer with another primary codec. Returns recomputed encodings when it did. */
  serverCodecChanged(
    track: LocalVideoTrack,
    opts: TrackPublishOptions,
    info: TrackInfo,
    req: AddTrackRequest,
  ): RTCRtpEncodingParameters[] | undefined;
  createScreenTracks(options?: ScreenShareCaptureOptions): Promise<LocalTrack[]>;
}

export class LocalParticipant extends Participant {
  audioTrackPublications: Map<string, LocalTrackPublication>;

  videoTrackPublications: Map<string, LocalTrackPublication>;

  /** map of track sid => all published tracks */
  trackPublications: Map<string, LocalTrackPublication>;

  /** @internal */
  engine: RTCEngine;

  /** @internal */
  activeDeviceMap: Map<MediaDeviceKind, string>;

  /** @internal */
  pendingPublishing = new Set<Track.Source>();

  private pendingPublishPromises = new Map<LocalTrack, Promise<LocalTrackPublication>>();

  private republishPromise: Promise<void> | undefined;

  private cameraError: Error | undefined;

  private microphoneError: Error | undefined;

  private participantTrackPermissions: Array<ParticipantTrackPermission> = [];

  private allParticipantsAllowedToSubscribe: boolean = true;

  // keep a pointer to room options
  private roomOptions: InternalRoomOptions;

  private encryptionType: Encryption_Type = Encryption_Type.NONE;

  private e2eeStateMutex = new Mutex();

  private reconnectFuture?: Future<void, Error>;

  private signalConnectedFuture?: Future<void, Error>;

  private activeAgentFuture?: Future<RemoteParticipant, Error>;

  private firstActiveAgent?: RemoteParticipant;

  private pendingSignalRequests: Map<
    number,
    {
      resolve: (arg: any) => void;
      reject: (reason: LivekitError) => void;
      values: Partial<Record<keyof LocalParticipant, any>>;
    }
  >;

  /** @internal */
  enabledPublishVideoCodecs: Codec[] = [];

  private readonly slots: LocalParticipantSlots;

  /** @internal */
  constructor(
    sid: string,
    identity: string,
    engine: RTCEngine,
    options: InternalRoomOptions,
    slots: LocalParticipantSlots = {},
  ) {
    super(sid, identity, undefined, undefined, undefined, {
      loggerName: options.loggerName,
      loggerContextCb: () => this.engine.logContext,
    });
    this.slots = slots;
    this.audioTrackPublications = new Map();
    this.videoTrackPublications = new Map();
    this.trackPublications = new Map();
    this.engine = engine;
    this.roomOptions = options;
    this.setupEngine(engine);
    this.activeDeviceMap = new Map([
      ['audioinput', 'default'],
      ['videoinput', 'default'],
      ['audiooutput', 'default'],
    ]);
    this.pendingSignalRequests = new Map();
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

    if (this.signalConnectedFuture?.isResolved) {
      this.signalConnectedFuture = undefined;
    }

    this.engine
      .on(EngineEvent.Connected, this.handleReconnected)
      .on(EngineEvent.SignalConnected, this.handleSignalConnected)
      .on(EngineEvent.SignalRestarted, this.handleReconnected)
      .on(EngineEvent.SignalResumed, this.handleReconnected)
      .on(EngineEvent.Restarting, this.handleReconnecting)
      .on(EngineEvent.Resuming, this.handleReconnecting)
      .on(EngineEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished)
      .on(EngineEvent.Closing, this.handleClosing)
      .on(EngineEvent.SignalRequestResponse, this.handleSignalRequestResponse);
  }

  private handleReconnecting = () => {
    if (!this.reconnectFuture) {
      this.reconnectFuture = new Future<void, Error>();
    }
  };

  private handleReconnected = () => {
    this.reconnectFuture?.resolve?.();
    this.reconnectFuture = undefined;
    this.updateTrackSubscriptionPermissions();
  };

  private handleClosing = () => {
    if (this.reconnectFuture) {
      // @throws-transformer ignore - introduced due to adding Throws into Future, investigate this
      // further
      this.reconnectFuture.promise.catch((e) => this.log.warn(e.message));
      this.reconnectFuture?.reject?.(new Error('Got disconnected during reconnection attempt'));
      this.reconnectFuture = undefined;
    }
    if (this.signalConnectedFuture) {
      this.signalConnectedFuture.reject?.(new Error('Got disconnected without signal connected'));
      this.signalConnectedFuture = undefined;
    }

    this.activeAgentFuture?.reject?.(new Error('Got disconnected without active agent present'));
    this.activeAgentFuture = undefined;
    this.firstActiveAgent = undefined;
  };

  private handleSignalConnected = (joinResponse: JoinResponse) => {
    if (joinResponse.participant) {
      this.updateInfo(joinResponse.participant);
    }
    if (!this.signalConnectedFuture) {
      this.signalConnectedFuture = new Future<void, Error>();
    }

    this.signalConnectedFuture.resolve?.();
  };

  private handleSignalRequestResponse = (response: RequestResponse) => {
    const { requestId, reason, message } = response;
    const targetRequest = this.pendingSignalRequests.get(requestId);
    if (targetRequest) {
      if (reason !== RequestResponse_Reason.OK) {
        targetRequest.reject(new SignalRequestError(message, reason));
      }
      this.pendingSignalRequests.delete(requestId);
    }
  };

  /**
   * Sets and updates the metadata of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission.
   * method will throw if the user doesn't have the required permissions
   * @param metadata
   */
  async setMetadata(metadata: string): Promise<void> {
    await this.requestMetadataUpdate({ metadata });
  }

  /**
   * Sets and updates the name of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission.
   * method will throw if the user doesn't have the required permissions
   * @param metadata
   */
  async setName(name: string): Promise<void> {
    await this.requestMetadataUpdate({ name });
  }

  /**
   * Set or update participant attributes. It will make updates only to keys that
   * are present in `attributes`, and will not override others.
   * Note: this requires `canUpdateOwnMetadata` permission.
   * @param attributes attributes to update
   */
  async setAttributes(attributes: Record<string, string>) {
    await this.requestMetadataUpdate({ attributes });
  }

  private async requestMetadataUpdate({
    metadata,
    name,
    attributes,
  }: {
    metadata?: string;
    name?: string;
    attributes?: Record<string, string>;
  }) {
    return new TypedPromise<void, Error>(async (resolve, reject) => {
      try {
        let isRejected = false;
        const requestId = await this.engine.client.sendUpdateLocalMetadata(
          metadata ?? this.metadata ?? '',
          name ?? this.name ?? '',
          attributes,
        );
        const startTime = performance.now();
        this.pendingSignalRequests.set(requestId, {
          resolve,
          reject: (error: LivekitError) => {
            reject(error);
            isRejected = true;
          },
          values: { name, metadata, attributes },
        });
        while (performance.now() - startTime < 5_000 && !isRejected) {
          if (
            (!name || this.name === name) &&
            (!metadata || this.metadata === metadata) &&
            (!attributes ||
              Object.entries(attributes).every(
                ([key, value]) =>
                  this.attributes[key] === value || (value === '' && !this.attributes[key]),
              ))
          ) {
            this.pendingSignalRequests.delete(requestId);
            resolve();
            return;
          }
          await sleep(50);
        }
        reject(
          new SignalRequestError('Request to update local metadata timed out', 'TimeoutError'),
        );
      } catch (e: unknown) {
        if (e instanceof Error) {
          reject(e);
        } else {
          reject(new Error(String(e)));
        }
      }
    });
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

  /** @internal */
  async setE2EEEnabled(enabled: boolean) {
    const unlock = await this.e2eeStateMutex.lock();
    try {
      this.encryptionType = enabled ? Encryption_Type.GCM : Encryption_Type.NONE;
      await Promise.all(this.pendingPublishPromises.values());
      if (
        this.trackPublications.size === 0 ||
        Array.from(this.trackPublications.values()).every((pub) => pub.isEncrypted === enabled)
      ) {
        return;
      }
      await this.republishAllTracks(undefined, false);
    } finally {
      unlock();
    }
  }

  /**
   * Enable or disable publishing for a track by source. This serves as a simple
   * way to manage the common tracks (camera, mic, or screen share).
   * Resolves with LocalTrackPublication if successful and void otherwise
   * @internal
   */
  async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.Camera>,
    enabled: boolean,
    options?: VideoCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.Microphone>,
    enabled: boolean,
    options?: AudioCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  async setTrackEnabled(
    source: Extract<Track.Source, Track.Source.ScreenShare>,
    enabled: boolean,
    options?: ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<LocalTrackPublication | undefined>;
  async setTrackEnabled(
    source: Track.Source,
    enabled: true,
    options?: VideoCaptureOptions | AudioCaptureOptions | ScreenShareCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ) {
    this.log.debug('setTrackEnabled', { source, enabled });
    if (this.republishPromise) {
      await this.republishPromise;
    }
    let track = this.getTrackPublication(source);
    if (enabled) {
      if (track) {
        await track.unmute();
      } else {
        let localTracks: Array<LocalTrack> | undefined;
        if (this.pendingPublishing.has(source)) {
          const pendingTrack = await this.waitForPendingPublicationOfSource(source);
          if (!pendingTrack) {
            this.log.info('waiting for pending publication promise timed out', { source });
          }
          await pendingTrack?.unmute();
          return pendingTrack;
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
              localTracks = await this.requireVideoPublisher().createScreenTracks({
                ...(options as ScreenShareCaptureOptions | undefined),
              });
              break;
            default:
              throw new TrackInvalidError(source);
          }
        } catch (e: unknown) {
          localTracks?.forEach((tr) => {
            tr.stop();
          });
          if (e instanceof Error) {
            this.emit(ParticipantEvent.MediaDevicesError, e, sourceToKind(source));
          }
          this.pendingPublishing.delete(source);
          throw e;
        }

        for (const localTrack of localTracks) {
          const opts: TrackPublishOptions = {
            ...this.roomOptions.publishDefaults,
            ...options,
          };
          if (
            source === Track.Source.Microphone &&
            isAudioTrack(localTrack) &&
            opts.preConnectBuffer
          ) {
            this.log.info('starting preconnect buffer for microphone');
            localTrack.startPreConnectBuffer();
          }
        }

        try {
          const publishPromises: Array<Promise<LocalTrackPublication>> = [];
          for (const localTrack of localTracks) {
            this.log.info('publishing track', getLogContextFromTrack(localTrack));

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
          throw e;
        } finally {
          this.pendingPublishing.delete(source);
        }
      }
    } else {
      if (!track?.track && this.pendingPublishing.has(source)) {
        // if there's no track available yet first wait for pending publishing promises of that source to see if it becomes available
        track = await this.waitForPendingPublicationOfSource(source);
        if (!track) {
          this.log.info('waiting for pending publication promise timed out', { source });
        }
      }
      if (track && track.track) {
        // screenshare cannot be muted, unpublish instead
        if (source === Track.Source.ScreenShare) {
          const unpublishPromises = [this.unpublishTrack(track.track)];
          const screenAudioTrack = this.getTrackPublication(Track.Source.ScreenShareAudio);
          if (screenAudioTrack && screenAudioTrack.track) {
            unpublishPromises.push(this.unpublishTrack(screenAudioTrack.track));
          }
          [track] = await Promise.all(unpublishPromises);
        } else {
          await track.mute();
        }
      }
    }
    return track;
  }

  /**
   * Create local camera and/or microphone tracks
   * @param options
   * @returns
   */
  async createTracks(options?: CreateLocalTracksOptions): Promise<LocalTrack[]> {
    options ??= {};

    const mergedOptionsWithProcessors = mergeDefaultOptions(
      options,
      this.roomOptions?.audioCaptureDefaults,
      this.roomOptions?.videoCaptureDefaults,
    );

    try {
      const tracks = await createLocalTracks(mergedOptionsWithProcessors, {
        loggerName: this.roomOptions.loggerName,
        loggerContextCb: () => this.logContext,
      });
      const localTracks = tracks.map((track) => {
        if (isAudioTrack(track)) {
          this.microphoneError = undefined;
          track.setAudioContext(this.audioContext);
          track.source = Track.Source.Microphone;
          this.emit(ParticipantEvent.AudioStreamAcquired);
        }
        if (isVideoTrack(track)) {
          this.cameraError = undefined;
          track.source = Track.Source.Camera;
        }
        return track;
      });
      return localTracks;
    } catch (err) {
      if (err instanceof Error) {
        if (options.audio) {
          this.microphoneError = err;
        }
        if (options.video) {
          this.cameraError = err;
        }
      }

      throw err;
    }
  }

  /** @internal logger options for tracks this participant creates */
  get trackLoggerOptions() {
    return { loggerName: this.roomOptions.loggerName, loggerContextCb: () => this.logContext };
  }

  private requireVideoPublisher(): VideoPublisher {
    if (!this.slots.videoPublisher) {
      throw new TrackInvalidError(
        'video publishing is not available in this build, add the video extension',
      );
    }
    return this.slots.videoPublisher;
  }

  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  async publishTrack(track: LocalTrack | MediaStreamTrack, options?: TrackPublishOptions) {
    return this.publishOrRepublishTrack(track, options);
  }

  /**
   * Waits for the engine's next `Restarted` event. Unlike `engine.waitForRestarted`, this does
   * not short-circuit when `pcState === Connected` — at the point this is called (right after a
   * `NegotiationError`) the PC transport is still connected, but `fullReconnectOnNext` has been
   * set and `attemptReconnect` is queued via setTimeout. We need to wait for that restart to
   * actually complete (which clears `pendingTrackResolvers` via `cleanupClient`) before retrying.
   */
  private waitForNextEngineRestart(timeoutMs = 15_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.engine.off(EngineEvent.Restarted, onRestarted);
        this.engine.off(EngineEvent.Closing, onClosing);
      };
      const onRestarted = () => {
        cleanup();
        resolve();
      };
      const onClosing = () => {
        cleanup();
        reject(new Error('engine closed before restart completed'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('timed out waiting for engine restart'));
      }, timeoutMs);
      this.engine.once(EngineEvent.Restarted, onRestarted);
      this.engine.once(EngineEvent.Closing, onClosing);
    });
  }

  private async publishOrRepublishTrack(
    track: LocalTrack | MediaStreamTrack,
    options?: TrackPublishOptions,
    isRepublish = false,
    hasRetriedAfterNegotiationError = false,
  ): Promise<LocalTrackPublication> {
    if (isLocalAudioTrack(track)) {
      track.setAudioContext(this.audioContext);
    }

    await this.reconnectFuture?.promise;
    if (this.republishPromise && !isRepublish) {
      await this.republishPromise;
    }
    if (isLocalTrack(track) && this.pendingPublishPromises.has(track)) {
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
          track = getVideoCapture().createTrack(
            track,
            defaultConstraints,
            true,
            this.trackLoggerOptions,
          );
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
      this.log.warn(
        'track has already been published, skipping',
        getLogContextFromTrack(existingPublication),
      );
      return existingPublication;
    }

    const opts: TrackPublishOptions = {
      ...this.roomOptions.publishDefaults,
      ...options,
    };
    const isStereoInput =
      ('channelCount' in track.mediaStreamTrack.getSettings() &&
        // @ts-ignore `channelCount` on getSettings() is currently only available for Safari, but is generally the best way to determine a stereo track https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/channelCount
        track.mediaStreamTrack.getSettings().channelCount === 2) ||
      track.mediaStreamTrack.getConstraints().channelCount === 2;
    const isStereo = opts.forceStereo ?? isStereoInput;

    // disable dtx for stereo track if not enabled explicitly
    if (isStereo) {
      if (opts.dtx === undefined) {
        this.log.debug(
          `Opus DTX will be disabled for stereo tracks by default. Enable them explicitly to make it work.`,
          getLogContextFromTrack(track),
        );
      }
      if (opts.red === undefined) {
        this.log.debug(
          `Opus RED will be disabled for stereo tracks by default. Enable them explicitly to make it work.`,
        );
      }
      opts.dtx ??= false;
      opts.red ??= false;
    }

    if (opts.source) {
      track.source = opts.source;
    }
    const publishPromise = new Promise<LocalTrackPublication>(async (resolve, reject) => {
      try {
        if (this.engine.client.currentState !== SignalConnectionState.CONNECTED) {
          this.log.debug('deferring track publication until signal is connected', {
            track: getLogContextFromTrack(track),
          });

          let publicationTimedOut = false;

          const timeout = setTimeout(() => {
            publicationTimedOut = true;
            track.stop();
            reject(
              new PublishTrackError(
                'publishing rejected as engine not connected within timeout',
                408,
              ),
            );
          }, 15_000);
          await this.waitUntilEngineConnected();
          clearTimeout(timeout);
          if (publicationTimedOut) {
            return;
          }
          const publication = await this.publish(track, opts, isStereo);
          resolve(publication);
        } else {
          try {
            const publication = await this.publish(track, opts, isStereo);
            resolve(publication);
          } catch (e) {
            reject(e);
          }
        }
      } catch (e) {
        reject(e);
      }
    });
    this.pendingPublishPromises.set(track, publishPromise);
    try {
      const publication = await publishPromise;
      return publication;
    } catch (e) {
      if (!hasRetriedAfterNegotiationError && e instanceof NegotiationError) {
        this.log.warn('negotiation due to track publish failed, retrying after reconnect', {
          error: e,
        });
        this.pendingPublishPromises.delete(track);
        await this.waitForNextEngineRestart();
        return await this.publishOrRepublishTrack(track, options, isRepublish, true);
      }
      throw e;
    } finally {
      this.pendingPublishPromises.delete(track);
    }
  }

  private waitUntilEngineConnected() {
    if (!this.signalConnectedFuture) {
      this.signalConnectedFuture = new Future<void, Error>();
    }
    return this.signalConnectedFuture.promise;
  }

  private hasPermissionsToPublish(track: LocalTrack): boolean {
    if (!this.permissions) {
      this.log.warn('no permissions present for publishing track', getLogContextFromTrack(track));
      return false;
    }
    const { canPublish, canPublishSources } = this.permissions;
    if (
      canPublish &&
      (canPublishSources.length === 0 ||
        canPublishSources.map((source) => getTrackSourceFromProto(source)).includes(track.source))
    ) {
      return true;
    }
    this.log.warn('insufficient permissions to publish', getLogContextFromTrack(track));
    return false;
  }

  private async publish(track: LocalTrack, opts: TrackPublishOptions, isStereo: boolean) {
    if (!this.hasPermissionsToPublish(track)) {
      throw new PublishTrackError('failed to publish track, insufficient permissions', 403);
    }
    const existingTrackOfSource = Array.from(this.trackPublications.values()).find(
      (publishedTrack) => isLocalTrack(track) && publishedTrack.source === track.source,
    );
    if (existingTrackOfSource && track.source !== Track.Source.Unknown) {
      this.log.info(
        `publishing a second track with the same source: ${track.source}`,
        getLogContextFromTrack(track),
      );
    }
    if (opts.stopMicTrackOnMute && isAudioTrack(track)) {
      track.stopOnMute = true;
    }

    // handle track actions
    track.on(TrackEvent.Muted, this.onTrackMuted);
    track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
    track.on(TrackEvent.Ended, this.handleTrackEnded);
    track.on(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
    track.on(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);
    track.on(TrackEvent.AudioTrackFeatureUpdate, this.onTrackFeatureUpdate);

    const audioFeatures: AudioTrackFeature[] = [];
    const disableDtx = !(opts.dtx ?? true);

    const settings = track.getSourceTrackSettings();

    if (settings.autoGainControl) {
      audioFeatures.push(AudioTrackFeature.TF_AUTO_GAIN_CONTROL);
    }
    if (settings.echoCancellation) {
      audioFeatures.push(AudioTrackFeature.TF_ECHO_CANCELLATION);
    }
    if (settings.noiseSuppression) {
      audioFeatures.push(AudioTrackFeature.TF_NOISE_SUPPRESSION);
    }
    if (settings.channelCount && settings.channelCount > 1) {
      audioFeatures.push(AudioTrackFeature.TF_STEREO);
    }
    if (disableDtx) {
      audioFeatures.push(AudioTrackFeature.TF_NO_DTX);
    }
    if (isLocalAudioTrack(track) && track.hasPreConnectBuffer) {
      audioFeatures.push(AudioTrackFeature.TF_PRECONNECT_BUFFER);
    }
    const packetTrailerFeatures: PacketTrailerFeature[] =
      this.normalizeRequestedFrameMetadataOptions(track, opts);

    // create track publication from track
    const req = new AddTrackRequest({
      // get local track id for use during publishing
      cid: track.mediaStreamTrack.id,
      name: opts.name,
      type: Track.kindToProto(track.kind),
      muted: track.isMuted,
      source: Track.sourceToProto(track.source),
      disableDtx,
      encryption: this.encryptionType,
      stereo: isStereo,
      disableRed: this.isE2EEEnabled || !(opts.red ?? true),
      stream: opts?.stream,
      backupCodecPolicy: opts?.backupCodecPolicy as BackupCodecPolicy,
      audioFeatures,
      packetTrailerFeatures,
    });

    // compute encodings and layers for video
    let encodings: RTCRtpEncodingParameters[] | undefined;
    if (isLocalVideoTrack(track)) {
      encodings = await this.requireVideoPublisher().prepare(track, opts, req);
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

    const negotiate = async () => {
      if (!this.engine.pcManager) {
        throw new UnexpectedConnectionState('pcManager is not ready');
      }

      track.sender = await this.engine.createSender(track, opts, encodings);
      if (isLocalVideoTrack(track)) {
        track.publishOptions = opts;
      }
      this.emit(ParticipantEvent.LocalSenderCreated, track.sender, track);

      if (isLocalVideoTrack(track)) {
        this.requireVideoPublisher().senderCreated(track, opts, encodings, req);
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
        }
      }

      await this.engine.negotiate();
    };

    let ti: TrackInfo;
    const addTrackPromise = new Promise<TrackInfo>(async (resolve, reject) => {
      try {
        ti = await this.engine.addTrack(req);
        resolve(ti);
      } catch (err) {
        if (track.sender && this.engine.pcManager?.publisher) {
          try {
            this.engine.pcManager.publisher.removeTrack(track.sender);
          } catch (e) {
            this.log.error(e);
          }
          await this.engine.negotiate().catch((negotiateErr) => {
            this.log.error(
              'failed to negotiate after removing track due to failed add track request',
              {
                ...getLogContextFromTrack(track),
                error: negotiateErr,
              },
            );
          });
        }
        reject(err);
      }
    });
    if (this.enabledPublishVideoCodecs.length > 0 && packetTrailerFeatures.length === 0) {
      const rets = await Promise.all([addTrackPromise, negotiate()]);
      ti = rets[0];
    } else {
      ti = await addTrackPromise;
      if (isLocalVideoTrack(track)) {
        // the server may answer with another primary codec
        encodings =
          this.requireVideoPublisher().serverCodecChanged(track, opts, ti, req) ?? encodings;
      }
      await negotiate();
    }

    const publication = new LocalTrackPublication(track.kind, ti, track, {
      loggerName: this.roomOptions.loggerName,
      loggerContextCb: () => this.logContext,
    });
    publication.on(TrackEvent.CpuConstrained, (constrainedTrack) =>
      this.onTrackCpuConstrained(constrainedTrack, publication),
    );
    // save options for when it needs to be republished again
    publication.options = opts;
    track.sid = ti.sid;

    // keep publish options on the video track so that it can recompute encoding
    // parameters when the MediaStreamTrack is restarted (e.g. after switching cameras).
    // Seed the dimensions we encoded at publish time so the first no-op restart
    // (e.g. unmute with unchanged constraints) can skip the recompute.
    if (isLocalVideoTrack(track)) {
      track.publishOptions = opts;
      if (req.width && req.height) {
        track.lastEncodedDimensions = { width: req.width, height: req.height };
      }
    }

    this.log.debug(`publishing ${track.kind} with encodings`, { encodings, trackInfo: ti });

    if (isLocalVideoTrack(track)) {
      track.startMonitor(this.engine.client);
    } else if (isLocalAudioTrack(track)) {
      track.startMonitor();
    }

    this.addTrackPublication(publication);
    // send event for publication
    this.emit(ParticipantEvent.LocalTrackPublished, publication);

    if (
      isLocalAudioTrack(track) &&
      ti.audioFeatures.includes(AudioTrackFeature.TF_PRECONNECT_BUFFER)
    ) {
      const stream = track.getPreConnectBuffer();
      const mimeType = track.getPreConnectBufferMimeType();
      // TODO: we're registering the listener after negotiation, so there might be a race
      this.on(ParticipantEvent.LocalTrackSubscribed, (pub) => {
        if (pub.trackSid === ti.sid) {
          if (!track.hasPreConnectBuffer) {
            this.log.warn('subscribe event came to late, buffer already closed');
            return;
          }
          this.log.debug('finished recording preconnect buffer', getLogContextFromTrack(track));
          track.stopPreConnectBuffer();
        }
      });

      if (stream) {
        const bufferStreamPromise = new Promise<void>(async (resolve, reject) => {
          try {
            this.log.debug('waiting for agent', getLogContextFromTrack(track));
            const agentActiveTimeout = setTimeout(() => {
              reject(new Error('agent not active within 10 seconds'));
            }, 10_000);
            const agent = await this.waitUntilActiveAgentPresent();
            clearTimeout(agentActiveTimeout);
            this.log.debug('sending preconnect buffer', getLogContextFromTrack(track));
            if (!this.slots.openByteStream) {
              throw new Error(
                'the dataStreams extension is required to send the preconnect buffer',
              );
            }
            const writer = await this.slots.openByteStream({
              name: 'preconnect-buffer',
              mimeType,
              topic: 'lk.agent.pre-connect-audio-buffer',
              destinationIdentities: [agent.identity],
              attributes: {
                trackId: publication.trackSid,
                sampleRate: String(settings.sampleRate ?? '48000'),
                channels: String(settings.channelCount ?? '1'),
              },
            });
            for await (const chunk of stream) {
              await writer.write(chunk);
            }
            await writer.close();
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        bufferStreamPromise
          .then(() => {
            this.log.debug('preconnect buffer sent successfully', getLogContextFromTrack(track));
          })
          .catch((e) => {
            this.log.error('error sending preconnect buffer', {
              ...getLogContextFromTrack(track),
              error: e,
            });
          });
      }
    }
    return publication;
  }

  private canPublishFrameMetadata() {
    return !!(
      this.roomOptions.e2ee ||
      this.roomOptions.encryption ||
      isFrameMetadataSupported(this.roomOptions.frameMetadata ?? this.roomOptions.packetTrailer)
    );
  }

  /** @internal */
  normalizeRequestedFrameMetadataOptions(track: LocalTrack, opts: TrackPublishOptions) {
    const fmOpts = opts.frameMetadata ?? opts.packetTrailer;
    if (track.kind !== Track.Kind.Video || !hasFrameMetadataPublishOptions(fmOpts)) {
      opts.frameMetadata = undefined;
      opts.packetTrailer = undefined;
      return [];
    }

    if (!this.canPublishFrameMetadata()) {
      this.log.warn('frame metadata transform not supported; not advertising features', {
        ...this.logContext,
        ...getLogContextFromTrack(track),
      });
      opts.frameMetadata = undefined;
      opts.packetTrailer = undefined;
      return [];
    }

    const features = getFrameMetadataFeatures(fmOpts);
    const normalized = getFrameMetadataPublishOptions(features);
    opts.frameMetadata = normalized;
    opts.packetTrailer = normalized;
    return features;
  }

  override get isLocal(): boolean {
    return true;
  }

  async unpublishTrack(
    track: LocalTrack | MediaStreamTrack,
    stopOnUnpublish?: boolean,
  ): Promise<LocalTrackPublication | undefined> {
    if (isLocalTrack(track)) {
      const publishPromise = this.pendingPublishPromises.get(track);
      if (publishPromise) {
        this.log.debug(
          'awaiting publish promise before attempting to unpublish',
          getLogContextFromTrack(track),
        );
        await publishPromise;
      }
    }
    // look through all published tracks to find the right ones
    const publication = this.getPublicationForTrack(track);

    const pubLogContext = publication ? getLogContextFromTrack(publication) : undefined;

    this.log.info('unpublishing track', pubLogContext);

    if (!publication || !publication.track) {
      this.log.warn('track was not unpublished because no publication was found', pubLogContext);
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
    } else {
      track.stopMonitor();
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
        try {
          negotiationNeeded = this.engine.removeTrack(trackSender);
        } catch (e) {
          this.log.warn(e);
          negotiationNeeded = true;
        }

        if (isLocalVideoTrack(track)) {
          for (const [, trackInfo] of track.simulcastCodecs) {
            if (trackInfo.sender) {
              try {
                negotiationNeeded = this.engine.removeTrack(trackInfo.sender);
              } catch (e) {
                this.log.warn(e);
                negotiationNeeded = true;
              }
              trackInfo.sender = undefined;
            }
          }
          track.simulcastCodecs.clear();
        }
      } catch (e) {
        this.log.warn('failed to unpublish track', { ...pubLogContext, error: e });
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
    return results.filter((track) => !!track);
  }

  async republishAllTracks(options?: TrackPublishOptions, restartTracks: boolean = true) {
    if (this.republishPromise) {
      await this.republishPromise;
    }
    this.republishPromise = new TypedPromise<void, Error>(async (resolve, reject) => {
      try {
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
              (isLocalAudioTrack(track) || isLocalVideoTrack(track)) &&
              !track.isUserProvided
            ) {
              // generally we need to restart the track before publishing, often a full reconnect
              // is necessary because computer had gone to sleep.
              this.log.debug('restarting existing track', { track: pub.trackSid });
              await track.restartTrack();
            }
            await this.publishOrRepublishTrack(track, pub.options, true);
          }),
        );
        resolve();
      } catch (error: unknown) {
        if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error(String(error)));
        }
      } finally {
        this.republishPromise = undefined;
      }
    });

    await this.republishPromise;
  }

  /**
   * Publish a new data payload to the room. Data will be forwarded to each
   * participant in the room if the destination field in publishOptions is empty
   *
   * @param data Uint8Array of the payload. To send string data, use TextEncoder.encode
   * @param options optionally specify a `reliable`, `topic` and `destination`
   */
  async publishData(data: NonSharedUint8Array, options: DataPublishOptions = {}): Promise<void> {
    const kind = options.reliable ? DataChannelKind.RELIABLE : DataChannelKind.LOSSY;
    const dataPacketKind = options.reliable ? DataPacket_Kind.RELIABLE : DataPacket_Kind.LOSSY;
    const destinationIdentities = options.destinationIdentities;
    const topic = options.topic;

    let userPacket = new UserPacket({
      participantIdentity: this.identity,
      payload: data,
      destinationIdentities,
      topic,
    });

    const packet = new DataPacket({
      kind: dataPacketKind,
      value: {
        case: 'user',
        value: userPacket,
      },
    });

    await this.engine.sendDataPacket(packet, kind);
  }

  /**
   * Publish SIP DTMF message to the room.
   *
   * @param code DTMF code
   * @param digit DTMF digit
   */
  async publishDtmf(code: number, digit: string): Promise<void> {
    const packet = new DataPacket({
      kind: DataPacket_Kind.RELIABLE,
      value: {
        case: 'sipDtmf',
        value: new SipDTMF({
          code: code,
          digit: digit,
        }),
      },
    });

    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
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
  setEnabledPublishCodecs(codecs: Codec[]) {
    this.enabledPublishVideoCodecs = codecs.filter(
      (c) => c.mime.split('/')[0].toLowerCase() === 'video',
    );
  }

  /** @internal */
  updateInfo(info: ParticipantInfo): boolean {
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
      allParticipantsAllowed: this.allParticipantsAllowedToSubscribe,
      participantTrackPermissions: this.participantTrackPermissions,
    });
    this.engine.client.sendUpdateSubscriptionPermissions(
      this.allParticipantsAllowedToSubscribe,
      this.participantTrackPermissions.map((p) => trackPermissionToProto(p)),
    );
  };

  /** @internal */
  setActiveAgent(agent: RemoteParticipant | undefined) {
    this.firstActiveAgent = agent;
    if (agent && !this.firstActiveAgent) {
      this.firstActiveAgent = agent;
    }
    if (agent) {
      this.activeAgentFuture?.resolve?.(agent);
    } else {
      this.activeAgentFuture?.reject?.(new Error('Agent disconnected'));
    }
    this.activeAgentFuture = undefined;
  }

  private waitUntilActiveAgentPresent() {
    if (this.firstActiveAgent) {
      return Promise.resolve(this.firstActiveAgent);
    }
    if (!this.activeAgentFuture) {
      this.activeAgentFuture = new Future<RemoteParticipant, Error>();
    }
    return this.activeAgentFuture.promise;
  }

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
      this.log.error(
        'could not update mute status for unpublished track',
        getLogContextFromTrack(track),
      );
      return;
    }

    this.engine.updateMuteStatus(track.sid, muted);
  };

  private onTrackUpstreamPaused = (track: LocalTrack) => {
    this.log.debug('upstream paused', getLogContextFromTrack(track));
    this.onTrackMuted(track, true);
  };

  private onTrackUpstreamResumed = (track: LocalTrack) => {
    this.log.debug('upstream resumed', getLogContextFromTrack(track));
    this.onTrackMuted(track, track.isMuted);
  };

  private onTrackFeatureUpdate = (track: LocalAudioTrack) => {
    const pub = this.audioTrackPublications.get(track.sid!);
    if (!pub) {
      this.log.warn(
        `Could not update local audio track settings, missing publication for track ${track.sid}`,
      );
      return;
    }
    this.engine.client.sendUpdateLocalAudioTrack(pub.trackSid, pub.getTrackFeatures());
  };

  private onTrackCpuConstrained = (track: LocalVideoTrack, publication: LocalTrackPublication) => {
    this.log.debug('track cpu constrained', getLogContextFromTrack(publication));
    this.emit(ParticipantEvent.LocalTrackCpuConstrained, track, publication);
  };

  private handleLocalTrackUnpublished = (unpublished: TrackUnpublishedResponse) => {
    const track = this.trackPublications.get(unpublished.trackSid);
    if (!track) {
      this.log.warn('received unpublished event for unknown track', {
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
      this.log.debug('unpublishing local track due to TrackEnded', getLogContextFromTrack(track));
      this.unpublishTrack(track);
    } else if (track.isUserProvided) {
      await track.mute();
    } else if (isLocalAudioTrack(track) || isLocalVideoTrack(track)) {
      try {
        if (isWeb()) {
          try {
            const currentPermissions = await navigator?.permissions.query({
              // the permission query for camera and microphone currently not supported in Safari and Firefox
              // @ts-ignore
              name: track.source === Track.Source.Camera ? 'camera' : 'microphone',
            });
            if (currentPermissions && currentPermissions.state === 'denied') {
              this.log.warn(
                `user has revoked access to ${track.source}`,
                getLogContextFromTrack(track),
              );

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
          this.log.debug(
            'track ended, attempting to use a different device',
            getLogContextFromTrack(track),
          );
          if (isLocalAudioTrack(track)) {
            // fall back to default device if available
            await track.restartTrack({ deviceId: 'default' });
          } else {
            await track.restartTrack();
          }
        }
      } catch (e) {
        this.log.warn(`could not restart track, muting instead`, getLogContextFromTrack(track));
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
        if (isLocalAudioTrack(localTrack) || isLocalVideoTrack(localTrack)) {
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

  private async waitForPendingPublicationOfSource(source: Track.Source) {
    const waitForPendingTimeout = 10_000;
    const startTime = Date.now();

    while (Date.now() < startTime + waitForPendingTimeout) {
      const publishPromiseEntry = Array.from(this.pendingPublishPromises.entries()).find(
        ([pendingTrack]) => pendingTrack.source === source,
      );
      if (publishPromiseEntry) {
        return publishPromiseEntry[1];
      }
      await sleep(20);
    }
  }
}

export default LocalParticipant;
