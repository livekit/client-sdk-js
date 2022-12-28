import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { toProtoSessionDescription } from '../api/SignalClient';
import log from '../logger';
import type {
  InternalRoomConnectOptions,
  InternalRoomOptions,
  RoomConnectOptions,
  RoomOptions,
} from '../options';
import {
  DataPacket_Kind,
  DisconnectReason,
  ParticipantInfo,
  ParticipantInfo_State,
  ParticipantPermission,
  Room as RoomModel,
  ServerInfo,
  SpeakerInfo,
  TrackInfo,
  TrackSource,
  TrackType,
  UserPacket,
} from '../proto/livekit_models';
import {
  ConnectionQualityUpdate,
  JoinResponse,
  SimulateScenario,
  StreamStateUpdate,
  SubscriptionPermissionUpdate,
} from '../proto/livekit_rtc';
import {
  audioDefaults,
  publishDefaults,
  roomConnectOptionDefaults,
  roomOptionDefaults,
  videoDefaults,
} from './defaults';
import DeviceManager from './DeviceManager';
import { E2EEManager } from '../e2ee/e2eeManager';
import { ConnectionError, UnsupportedServer } from './errors';
import { EngineEvent, ParticipantEvent, RoomEvent, TrackEvent } from './events';
import LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import RTCEngine from './RTCEngine';
import LocalAudioTrack from './track/LocalAudioTrack';
import LocalTrackPublication from './track/LocalTrackPublication';
import LocalVideoTrack from './track/LocalVideoTrack';
import type RemoteTrack from './track/RemoteTrack';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import type { AdaptiveStreamSettings } from './track/types';
import { getNewAudioContext } from './track/utils';
import type { SimulationOptions } from './types';
import {
  Future,
  createDummyVideoStreamTrack,
  getEmptyAudioStreamTrack,
  isWeb,
  Mutex,
  supportsSetSinkId,
  unpackStreamId,
} from './utils';
import { EncryptionEvent } from '../e2ee';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

/** @deprecated RoomState has been renamed to [[ConnectionState]] */
export const RoomState = ConnectionState;

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
class Room extends (EventEmitter as new () => TypedEmitter<RoomEventCallbacks>) {
  state: ConnectionState = ConnectionState.Disconnected;

  /** map of sid: [[RemoteParticipant]] */
  participants: Map<string, RemoteParticipant>;

  /**
   * list of participants that are actively speaking. when this changes
   * a [[RoomEvent.ActiveSpeakersChanged]] event is fired
   */
  activeSpeakers: Participant[] = [];

  /** @internal */
  engine!: RTCEngine;

  // available after connected
  /** server assigned unique room id */
  sid: string = '';

  /** user assigned name, derived from JWT token */
  name: string = '';

  /** the current participant */
  localParticipant: LocalParticipant;

  /** room metadata */
  metadata: string | undefined = undefined;

  /** options of room */
  options: InternalRoomOptions;

  isE2EEEnabled: boolean = false;

  private _isRecording: boolean = false;

  private identityToSid: Map<string, string>;

  /** connect options of room */
  private connOptions?: InternalRoomConnectOptions;

  private audioEnabled = true;

  private audioContext?: AudioContext;

  /** used for aborting pending connections to a LiveKit server */
  private abortController?: AbortController;

  /** future holding client initiated connection attempt */
  private connectFuture?: Future<void>;

  private disconnectLock: Mutex;

  private e2eeManager: E2EEManager | undefined;

  /**
   * Creates a new Room, the primary construct for a LiveKit session.
   * @param options
   */
  constructor(options?: RoomOptions) {
    super();
    this.setMaxListeners(100);
    this.participants = new Map();
    this.identityToSid = new Map();
    this.options = { ...roomOptionDefaults, ...options };

    this.options.audioCaptureDefaults = {
      ...audioDefaults,
      ...options?.audioCaptureDefaults,
    };
    this.options.videoCaptureDefaults = {
      ...videoDefaults,
      ...options?.videoCaptureDefaults,
    };
    this.options.publishDefaults = {
      ...publishDefaults,
      ...options?.publishDefaults,
    };

    this.maybeCreateEngine();

    this.disconnectLock = new Mutex();

    this.localParticipant = new LocalParticipant('', '', this.engine, this.options);

    if (this.options.e2ee) {
      this.e2eeManager = new E2EEManager(this.options.e2ee);
      this.e2eeManager.on(
        EncryptionEvent.ParticipantEncryptionStatusChanged,
        (enabled, participant) => {
          console.log('encryption status changed: ' + enabled);
          this.isE2EEEnabled = enabled;
          this.emit(RoomEvent.ParticipantEncryptionStatusChanged, enabled, participant);
        },
      );
      this.e2eeManager?.setup(this);
    }
  }

  async setE2EEEnabled(enabled: boolean) {
    if (this.e2eeManager) {
      await Promise.all([
        this.localParticipant.setE2EEEnabled(enabled),
        this.e2eeManager.setParticipantCryptorEnabled(enabled),
      ]);
    } else {
      throw Error('e2ee not configured, please set e2ee settings within the room options');
    }
  }

  private maybeCreateEngine() {
    if (this.engine) {
      return;
    }

    this.engine = new RTCEngine(this.options);

    this.engine.client.onParticipantUpdate = this.handleParticipantUpdates;
    this.engine.client.onRoomUpdate = this.handleRoomUpdate;
    this.engine.client.onSpeakersChanged = this.handleSpeakersChanged;
    this.engine.client.onStreamStateUpdate = this.handleStreamStateUpdate;
    this.engine.client.onSubscriptionPermissionUpdate = this.handleSubscriptionPermissionUpdate;
    this.engine.client.onConnectionQuality = this.handleConnectionQualityUpdate;

    this.engine
      .on(
        EngineEvent.MediaTrackAdded,
        (mediaTrack: MediaStreamTrack, stream: MediaStream, receiver?: RTCRtpReceiver) => {
          this.onTrackAdded(mediaTrack, stream, receiver);
        },
      )
      .on(EngineEvent.Disconnected, (reason?: DisconnectReason) => {
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish, reason);
      })
      .on(EngineEvent.ActiveSpeakersUpdate, this.handleActiveSpeakersUpdate)
      .on(EngineEvent.DataPacketReceived, this.handleDataPacket)
      .on(EngineEvent.Resuming, () => {
        if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
          this.emit(RoomEvent.Reconnecting);
        }
      })
      .on(EngineEvent.Resumed, () => {
        this.setAndEmitConnectionState(ConnectionState.Connected);
        this.emit(RoomEvent.Reconnected);
        this.updateSubscriptions();
      })
      .on(EngineEvent.SignalResumed, () => {
        if (this.state === ConnectionState.Reconnecting) {
          this.sendSyncState();
        }
      })
      .on(EngineEvent.Restarting, this.handleRestarting)
      .on(EngineEvent.Restarted, this.handleRestarted);

    if (this.localParticipant) {
      this.localParticipant.setupEngine(this.engine);
    }
  }

  /**
   * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
   * In particular, it handles Chrome's unique behavior of creating `default`
   * devices. When encountered, it'll be removed from the list of devices.
   * The actual default device will be placed at top.
   * @param kind
   * @returns a list of available local devices
   */
  static getLocalDevices(
    kind?: MediaDeviceKind,
    requestPermissions: boolean = true,
  ): Promise<MediaDeviceInfo[]> {
    return DeviceManager.getInstance().getDevices(kind, requestPermissions);
  }

  /**
   * prepares the connection to the livekit server by sending a HEAD request in order to
   * 1. speed up DNS resolution
   * 2. speed up TLS setup
   * on the actual connection request
   * throws an error if server is not reachable after the request timeout
   * @experimental
   */
  async prepareConnection(url: string) {
    await fetch(`http${url.substring(2)}`, { method: 'HEAD' });
  }

  connect = (url: string, token: string, opts?: RoomConnectOptions): Promise<void> => {
    if (this.state === ConnectionState.Connected) {
      // when the state is reconnecting or connected, this function returns immediately
      log.info(`already connected to room ${this.name}`);
      return Promise.resolve();
    }

    if (this.connectFuture) {
      return this.connectFuture.promise;
    }

    this.setAndEmitConnectionState(ConnectionState.Connecting);

    const connectFn = async (resolve: () => void, reject: (reason: any) => void) => {
      if (!this.abortController || this.abortController.signal.aborted) {
        this.abortController = new AbortController();
      }

      if (this.state === ConnectionState.Reconnecting) {
        log.info('Reconnection attempt replaced by new connection attempt');
        // make sure we close and recreate the existing engine in order to get rid of any potentially ongoing reconnection attempts
        this.recreateEngine();
      } else {
        // create engine if previously disconnected
        this.maybeCreateEngine();
      }

      this.acquireAudioContext();

      this.connOptions = { ...roomConnectOptionDefaults, ...opts } as InternalRoomConnectOptions;

      if (this.connOptions.rtcConfig) {
        this.engine.rtcConfig = this.connOptions.rtcConfig;
      }
      if (this.connOptions.peerConnectionTimeout) {
        this.engine.peerConnectionTimeout = this.connOptions.peerConnectionTimeout;
      }

      try {
        const joinResponse = await this.engine.join(
          url,
          token,
          {
            autoSubscribe: this.connOptions.autoSubscribe,
            publishOnly: this.connOptions.publishOnly,
            adaptiveStream:
              typeof this.options.adaptiveStream === 'object' ? true : this.options.adaptiveStream,
            maxRetries: this.connOptions.maxRetries,
            e2eeEnabled: !!this.e2eeManager,
          },
          this.abortController.signal,
        );

        let serverInfo: Partial<ServerInfo> | undefined = joinResponse.serverInfo;
        if (!serverInfo) {
          serverInfo = { version: joinResponse.serverVersion, region: joinResponse.serverRegion };
        }

        log.debug(
          `connected to Livekit Server ${Object.entries(serverInfo)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')}`,
        );

        if (!joinResponse.serverVersion) {
          throw new UnsupportedServer('unknown server version');
        }

        if (joinResponse.serverVersion === '0.15.1' && this.options.dynacast) {
          log.debug('disabling dynacast due to server version');
          // dynacast has a bug in 0.15.1, so we cannot use it then
          this.options.dynacast = false;
        }

        const pi = joinResponse.participant!;

        this.localParticipant.sid = pi.sid;
        this.localParticipant.identity = pi.identity;

        this.localParticipant.updateInfo(pi);
        // forward metadata changed for the local participant
        this.setupLocalParticipantEvents();

        // populate remote participants, these should not trigger new events
        joinResponse.otherParticipants.forEach((info) => {
          if (
            info.sid !== this.localParticipant.sid &&
            info.identity !== this.localParticipant.identity
          ) {
            this.getOrCreateParticipant(info.sid, info);
          } else {
            log.warn('received info to create local participant as remote participant', {
              info,
              localParticipant: this.localParticipant,
            });
          }
        });

        this.name = joinResponse.room!.name;
        this.sid = joinResponse.room!.sid;
        this.metadata = joinResponse.room!.metadata;
        if (this._isRecording !== joinResponse.room!.activeRecording) {
          this._isRecording = joinResponse.room!.activeRecording;
          this.emit(RoomEvent.RecordingStatusChanged, joinResponse.room!.activeRecording);
        }
        this.emit(RoomEvent.SignalConnected);
      } catch (err) {
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        let errorMessage = '';
        if (err instanceof Error) {
          errorMessage = err.message;
          log.debug(`error trying to establish signal connection`, { error: err });
        }
        reject(new ConnectionError(`could not establish signal connection: ${errorMessage}`));
        return;
      }

      // don't return until ICE connected
      const connectTimeout = setTimeout(() => {
        // timeout
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        reject(new ConnectionError('could not connect PeerConnection after timeout'));
      }, this.connOptions.peerConnectionTimeout);
      const abortHandler = () => {
        log.warn('closing engine');
        clearTimeout(connectTimeout);
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        reject(new ConnectionError('room connection has been cancelled'));
      };
      if (this.abortController?.signal.aborted) {
        abortHandler();
      }
      this.abortController?.signal.addEventListener('abort', abortHandler);

      this.engine.once(EngineEvent.Connected, () => {
        clearTimeout(connectTimeout);
        this.abortController?.signal.removeEventListener('abort', abortHandler);
        // also hook unload event
        if (isWeb()) {
          window.addEventListener('beforeunload', this.onBeforeUnload);
          navigator.mediaDevices?.addEventListener('devicechange', this.handleDeviceChange);
        }
        this.setAndEmitConnectionState(ConnectionState.Connected);
        this.emit(RoomEvent.Connected);
        resolve();
      });
    };
    this.connectFuture = new Future(connectFn, () => {
      this.clearConnectionFutures();
    });

    return this.connectFuture.promise;
  };

  /**
   * disconnects the room, emits [[RoomEvent.Disconnected]]
   */
  disconnect = async (stopTracks = true) => {
    const unlock = await this.disconnectLock.lock();
    try {
      if (this.state === ConnectionState.Disconnected) {
        log.debug('already disconnected');
        return;
      }
      log.info('disconnect from room', { identity: this.localParticipant.identity });
      if (
        this.state === ConnectionState.Connecting ||
        this.state === ConnectionState.Reconnecting
      ) {
        // try aborting pending connection attempt
        log.warn('abort connection attempt');
        this.abortController?.abort();
        // in case the abort controller didn't manage to cancel the connection attempt, reject the connect promise explicitly
        this.connectFuture?.reject?.(new ConnectionError('Client initiated disconnect'));
        this.connectFuture = undefined;
      }
      // send leave
      if (this.engine?.client.isConnected) {
        await this.engine.client.sendLeave();
      }
      // close engine (also closes client)
      if (this.engine) {
        await this.engine.close();
      }
      this.handleDisconnect(stopTracks, DisconnectReason.CLIENT_INITIATED);
      /* @ts-ignore */
      this.engine = undefined;
    } finally {
      unlock();
    }
  };

  /**
   * retrieves a participant by identity
   * @param identity
   * @returns
   */
  getParticipantByIdentity(identity: string): Participant | undefined {
    if (this.localParticipant.identity === identity) {
      return this.localParticipant;
    }
    const sid = this.identityToSid.get(identity);
    if (sid) {
      return this.participants.get(sid);
    }
  }

  private clearConnectionFutures() {
    this.connectFuture = undefined;
  }

  /**
   * if the current room has a participant with `recorder: true` in its JWT grant
   **/
  get isRecording() {
    return this._isRecording;
  }

  /**
   * @internal for testing
   */
  async simulateScenario(scenario: string) {
    let postAction = () => {};
    let req: SimulateScenario | undefined;
    switch (scenario) {
      case 'signal-reconnect':
        await this.engine.client.close();
        if (this.engine.client.onClose) {
          this.engine.client.onClose('simulate disconnect');
        }
        break;
      case 'speaker':
        req = SimulateScenario.fromPartial({
          scenario: {
            $case: 'speakerUpdate',
            speakerUpdate: 3,
          },
        });
        break;
      case 'node-failure':
        req = SimulateScenario.fromPartial({
          scenario: {
            $case: 'nodeFailure',
            nodeFailure: true,
          },
        });
        break;
      case 'server-leave':
        req = SimulateScenario.fromPartial({
          scenario: {
            $case: 'serverLeave',
            serverLeave: true,
          },
        });
        break;
      case 'migration':
        req = SimulateScenario.fromPartial({
          scenario: {
            $case: 'migration',
            migration: true,
          },
        });
        break;
      case 'force-tcp':
      case 'force-tls':
        req = SimulateScenario.fromPartial({
          scenario: {
            $case: 'switchCandidateProtocol',
            switchCandidateProtocol: scenario === 'force-tls' ? 2 : 1,
          },
        });
        postAction = async () => {
          const onLeave = this.engine.client.onLeave;
          if (onLeave) {
            onLeave({
              reason: DisconnectReason.CLIENT_INITIATED,
              canReconnect: true,
            });
          }
        };
        break;
      default:
    }
    if (req) {
      this.engine.client.sendSimulateScenario(req);
      postAction();
    }
  }

  private onBeforeUnload = async () => {
    await this.disconnect();
  };

  /**
   * Browsers have different policies regarding audio playback. Most requiring
   * some form of user interaction (click/tap/etc).
   * In those cases, audio will be silent until a click/tap triggering one of the following
   * - `startAudio`
   * - `getUserMedia`
   */
  async startAudio() {
    await this.acquireAudioContext();

    const elements: Array<HTMLMediaElement> = [];
    this.participants.forEach((p) => {
      p.audioTracks.forEach((t) => {
        if (t.track) {
          t.track.attachedElements.forEach((e) => {
            elements.push(e);
          });
        }
      });
    });

    try {
      await Promise.all(
        elements.map((e) => {
          e.muted = false;
          return e.play();
        }),
      );
      this.handleAudioPlaybackStarted();
    } catch (err) {
      this.handleAudioPlaybackFailed(err);
      throw err;
    }
  }

  /**
   * Returns true if audio playback is enabled
   */
  get canPlaybackAudio(): boolean {
    return this.audioEnabled;
  }

  /**
   * Returns the active audio output device used in this room.
   *
   * Note: to get the active `audioinput` or `videoinput` use [[LocalTrack.getDeviceId()]]
   *
   * @return the previously successfully set audio output device ID or an empty string if the default device is used.
   */
  getActiveAudioOutputDevice(): string {
    return this.options.audioOutput?.deviceId ?? '';
  }

  /**
   * Switches all active devices used in this room to the given device.
   *
   * Note: setting AudioOutput is not supported on some browsers. See [setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId#browser_compatibility)
   *
   * @param kind use `videoinput` for camera track,
   *  `audioinput` for microphone track,
   *  `audiooutput` to set speaker for all incoming audio tracks
   * @param deviceId
   */
  async switchActiveDevice(kind: MediaDeviceKind, deviceId: string) {
    if (kind === 'audioinput') {
      const prevDeviceId = this.options.audioCaptureDefaults!.deviceId;
      this.options.audioCaptureDefaults!.deviceId = deviceId;
      const tracks = Array.from(this.localParticipant.audioTracks.values()).filter(
        (track) => track.source === Track.Source.Microphone,
      );
      try {
        await Promise.all(tracks.map((t) => t.audioTrack?.setDeviceId(deviceId)));
      } catch (e) {
        this.options.audioCaptureDefaults!.deviceId = prevDeviceId;
        throw e;
      }
    } else if (kind === 'videoinput') {
      const prevDeviceId = this.options.videoCaptureDefaults!.deviceId;
      this.options.videoCaptureDefaults!.deviceId = deviceId;
      const tracks = Array.from(this.localParticipant.videoTracks.values()).filter(
        (track) => track.source === Track.Source.Camera,
      );
      try {
        await Promise.all(tracks.map((t) => t.videoTrack?.setDeviceId(deviceId)));
      } catch (e) {
        this.options.videoCaptureDefaults!.deviceId = prevDeviceId;
        throw e;
      }
    } else if (kind === 'audiooutput') {
      // TODO add support for webaudio mix once the API becomes available https://github.com/WebAudio/web-audio-api/pull/2498
      if (!supportsSetSinkId()) {
        throw new Error('cannot switch audio output, setSinkId not supported');
      }
      this.options.audioOutput ??= {};
      const prevDeviceId = this.options.audioOutput.deviceId;
      this.options.audioOutput.deviceId = deviceId;
      try {
        await Promise.all(
          Array.from(this.participants.values()).map((p) => p.setAudioOutput({ deviceId })),
        );
      } catch (e) {
        this.options.audioOutput.deviceId = prevDeviceId;
        throw e;
      }
    }
  }

  private setupLocalParticipantEvents() {
    this.localParticipant
      .on(ParticipantEvent.ParticipantMetadataChanged, this.onLocalParticipantMetadataChanged)
      .on(ParticipantEvent.TrackMuted, this.onLocalTrackMuted)
      .on(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted)
      .on(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished)
      .on(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
      .on(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged)
      .on(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError)
      .on(
        ParticipantEvent.ParticipantPermissionsChanged,
        this.onLocalParticipantPermissionsChanged,
      );
  }

  private recreateEngine() {
    this.engine?.close();
    /* @ts-ignore */
    this.engine = undefined;

    // clear out existing remote participants, since they may have attached
    // the old engine
    this.participants.clear();
    this.maybeCreateEngine();
  }

  private onTrackAdded(
    mediaTrack: MediaStreamTrack,
    stream: MediaStream,
    receiver?: RTCRtpReceiver,
  ) {
    // don't fire onSubscribed when connecting
    // WebRTC fires onTrack as soon as setRemoteDescription is called on the offer
    // at that time, ICE connectivity has not been established so the track is not
    // technically subscribed.
    // We'll defer these events until when the room is connected or eventually disconnected.
    if (this.state === ConnectionState.Connecting || this.state === ConnectionState.Reconnecting) {
      const reconnectedHandler = () => {
        this.onTrackAdded(mediaTrack, stream, receiver);
        cleanup();
      };
      const cleanup = () => {
        this.off(RoomEvent.Reconnected, reconnectedHandler);
        this.off(RoomEvent.Connected, reconnectedHandler);
        this.off(RoomEvent.Disconnected, cleanup);
      };
      this.once(RoomEvent.Reconnected, reconnectedHandler);
      this.once(RoomEvent.Connected, reconnectedHandler);
      this.once(RoomEvent.Disconnected, cleanup);
      return;
    }
    if (this.state === ConnectionState.Disconnected) {
      log.warn('skipping incoming track after Room disconnected');
      return;
    }
    const parts = unpackStreamId(stream.id);
    const participantId = parts[0];
    let trackId = parts[1];
    if (!trackId || trackId === '') trackId = mediaTrack.id;

    if (participantId === this.localParticipant.sid) {
      log.warn('tried to create RemoteParticipant for local participant');
      return;
    }
    const participant = this.getOrCreateParticipant(participantId);

    let adaptiveStreamSettings: AdaptiveStreamSettings | undefined;
    if (this.options.adaptiveStream) {
      if (typeof this.options.adaptiveStream === 'object') {
        adaptiveStreamSettings = this.options.adaptiveStream;
      } else {
        adaptiveStreamSettings = {};
      }
    }
    participant.addSubscribedMediaTrack(
      mediaTrack,
      trackId,
      stream,
      receiver,
      adaptiveStreamSettings,
    );
  }

  private handleRestarting = () => {
    // also unwind existing participants & existing subscriptions
    for (const p of this.participants.values()) {
      this.handleParticipantDisconnected(p.sid, p);
    }

    if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
      this.emit(RoomEvent.Reconnecting);
    }
  };

  private handleRestarted = async (joinResponse: JoinResponse) => {
    log.debug(`reconnected to server`, {
      region: joinResponse.serverRegion,
    });
    this.setAndEmitConnectionState(ConnectionState.Connected);
    this.emit(RoomEvent.Reconnected);

    // rehydrate participants
    if (joinResponse.participant) {
      // with a restart, the sid will have changed, we'll map our understanding to it
      this.localParticipant.sid = joinResponse.participant.sid;
      this.handleParticipantUpdates([joinResponse.participant]);
    }
    this.handleParticipantUpdates(joinResponse.otherParticipants);

    // unpublish & republish tracks
    await this.localParticipant.republishAllTracks();
  };

  private handleDisconnect(shouldStopTracks = true, reason?: DisconnectReason) {
    if (this.state === ConnectionState.Disconnected) {
      return;
    }

    this.participants.forEach((p) => {
      p.tracks.forEach((pub) => {
        p.unpublishTrack(pub.trackSid);
      });
    });

    this.localParticipant.tracks.forEach((pub) => {
      if (pub.track) {
        this.localParticipant.unpublishTrack(pub.track, shouldStopTracks);
      }
      if (shouldStopTracks) {
        pub.track?.detach();
        pub.track?.stop();
      }
    });

    this.localParticipant
      .off(ParticipantEvent.ParticipantMetadataChanged, this.onLocalParticipantMetadataChanged)
      .off(ParticipantEvent.TrackMuted, this.onLocalTrackMuted)
      .off(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted)
      .off(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished)
      .off(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
      .off(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged)
      .off(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError)
      .off(
        ParticipantEvent.ParticipantPermissionsChanged,
        this.onLocalParticipantPermissionsChanged,
      );

    this.localParticipant.tracks.clear();
    this.localParticipant.videoTracks.clear();
    this.localParticipant.audioTracks.clear();

    this.participants.clear();
    this.activeSpeakers = [];
    if (this.audioContext && typeof this.options.expWebAudioMix === 'boolean') {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    if (isWeb()) {
      window.removeEventListener('beforeunload', this.onBeforeUnload);
      navigator.mediaDevices?.removeEventListener('devicechange', this.handleDeviceChange);
    }
    this.setAndEmitConnectionState(ConnectionState.Disconnected);
    this.emit(RoomEvent.Disconnected, reason);
  }

  private handleParticipantUpdates = (participantInfos: ParticipantInfo[]) => {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      if (
        info.sid === this.localParticipant.sid ||
        info.identity === this.localParticipant.identity
      ) {
        this.localParticipant.updateInfo(info);
        return;
      }

      // ensure identity <=> sid mapping
      const sid = this.identityToSid.get(info.identity);
      if (sid && sid !== info.sid) {
        // sid had changed, need to remove previous participant
        this.handleParticipantDisconnected(sid, this.participants.get(sid));
      }

      let remoteParticipant = this.participants.get(info.sid);
      const isNewParticipant = !remoteParticipant;

      // create participant if doesn't exist
      remoteParticipant = this.getOrCreateParticipant(info.sid, info);

      // when it's disconnected, send updates
      if (info.state === ParticipantInfo_State.DISCONNECTED) {
        this.handleParticipantDisconnected(info.sid, remoteParticipant);
      } else if (!isNewParticipant) {
        // just update, no events
        remoteParticipant.updateInfo(info);
      }
    });
  };

  private handleParticipantDisconnected(sid: string, participant?: RemoteParticipant) {
    // remove and send event
    this.participants.delete(sid);
    if (!participant) {
      return;
    }

    this.identityToSid.delete(participant.identity);
    participant.tracks.forEach((publication) => {
      participant.unpublishTrack(publication.trackSid, true);
    });
    this.emitWhenConnected(RoomEvent.ParticipantDisconnected, participant);
  }

  // updates are sent only when there's a change to speaker ordering
  private handleActiveSpeakersUpdate = (speakers: SpeakerInfo[]) => {
    const activeSpeakers: Participant[] = [];
    const seenSids: any = {};
    speakers.forEach((speaker) => {
      seenSids[speaker.sid] = true;
      if (speaker.sid === this.localParticipant.sid) {
        this.localParticipant.audioLevel = speaker.level;
        this.localParticipant.setIsSpeaking(true);
        activeSpeakers.push(this.localParticipant);
      } else {
        const p = this.participants.get(speaker.sid);
        if (p) {
          p.audioLevel = speaker.level;
          p.setIsSpeaking(true);
          activeSpeakers.push(p);
        }
      }
    });

    if (!seenSids[this.localParticipant.sid]) {
      this.localParticipant.audioLevel = 0;
      this.localParticipant.setIsSpeaking(false);
    }
    this.participants.forEach((p) => {
      if (!seenSids[p.sid]) {
        p.audioLevel = 0;
        p.setIsSpeaking(false);
      }
    });

    this.activeSpeakers = activeSpeakers;
    this.emitWhenConnected(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
  };

  // process list of changed speakers
  private handleSpeakersChanged = (speakerUpdates: SpeakerInfo[]) => {
    const lastSpeakers = new Map<string, Participant>();
    this.activeSpeakers.forEach((p) => {
      lastSpeakers.set(p.sid, p);
    });
    speakerUpdates.forEach((speaker) => {
      let p: Participant | undefined = this.participants.get(speaker.sid);
      if (speaker.sid === this.localParticipant.sid) {
        p = this.localParticipant;
      }
      if (!p) {
        return;
      }
      p.audioLevel = speaker.level;
      p.setIsSpeaking(speaker.active);

      if (speaker.active) {
        lastSpeakers.set(speaker.sid, p);
      } else {
        lastSpeakers.delete(speaker.sid);
      }
    });
    const activeSpeakers = Array.from(lastSpeakers.values());
    activeSpeakers.sort((a, b) => b.audioLevel - a.audioLevel);
    this.activeSpeakers = activeSpeakers;
    this.emitWhenConnected(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
  };

  private handleStreamStateUpdate = (streamStateUpdate: StreamStateUpdate) => {
    streamStateUpdate.streamStates.forEach((streamState) => {
      const participant = this.participants.get(streamState.participantSid);
      if (!participant) {
        return;
      }
      const pub = participant.getTrackPublication(streamState.trackSid);
      if (!pub || !pub.track) {
        return;
      }
      pub.track.streamState = Track.streamStateFromProto(streamState.state);
      participant.emit(ParticipantEvent.TrackStreamStateChanged, pub, pub.track.streamState);
      this.emitWhenConnected(
        RoomEvent.TrackStreamStateChanged,
        pub,
        pub.track.streamState,
        participant,
      );
    });
  };

  private handleSubscriptionPermissionUpdate = (update: SubscriptionPermissionUpdate) => {
    const participant = this.participants.get(update.participantSid);
    if (!participant) {
      return;
    }
    const pub = participant.getTrackPublication(update.trackSid);
    if (!pub) {
      return;
    }

    pub.setAllowed(update.allowed);
  };

  private handleDataPacket = (userPacket: UserPacket, kind: DataPacket_Kind) => {
    // find the participant
    const participant = this.participants.get(userPacket.participantSid);

    this.emit(RoomEvent.DataReceived, userPacket.payload, participant, kind);

    // also emit on the participant
    participant?.emit(ParticipantEvent.DataReceived, userPacket.payload, kind);
  };

  private handleAudioPlaybackStarted = () => {
    if (this.canPlaybackAudio) {
      return;
    }
    this.audioEnabled = true;
    this.emit(RoomEvent.AudioPlaybackStatusChanged, true);
  };

  private handleAudioPlaybackFailed = (e: any) => {
    log.warn('could not playback audio', e);
    if (!this.canPlaybackAudio) {
      return;
    }
    this.audioEnabled = false;
    this.emit(RoomEvent.AudioPlaybackStatusChanged, false);
  };

  private handleDeviceChange = async () => {
    this.emit(RoomEvent.MediaDevicesChanged);
  };

  private handleRoomUpdate = (r: RoomModel) => {
    if (this._isRecording !== r.activeRecording) {
      this._isRecording = r.activeRecording;
      this.emit(RoomEvent.RecordingStatusChanged, r.activeRecording);
    }
    if (this.metadata !== r.metadata) {
      this.metadata = r.metadata;
      this.emitWhenConnected(RoomEvent.RoomMetadataChanged, r.metadata);
    }
  };

  private handleConnectionQualityUpdate = (update: ConnectionQualityUpdate) => {
    update.updates.forEach((info) => {
      if (info.participantSid === this.localParticipant.sid) {
        this.localParticipant.setConnectionQuality(info.quality);
        return;
      }
      const participant = this.participants.get(info.participantSid);
      if (participant) {
        participant.setConnectionQuality(info.quality);
      }
    });
  };

  private async acquireAudioContext() {
    if (
      typeof this.options.expWebAudioMix !== 'boolean' &&
      this.options.expWebAudioMix.audioContext
    ) {
      // override audio context with custom audio context if supplied by user
      this.audioContext = this.options.expWebAudioMix.audioContext;
      await this.audioContext.resume();
    } else {
      // by using an AudioContext, it reduces lag on audio elements
      // https://stackoverflow.com/questions/9811429/html5-audio-tag-on-safari-has-a-delay/54119854#54119854
      this.audioContext = getNewAudioContext() ?? undefined;
    }

    if (this.options.expWebAudioMix) {
      this.participants.forEach((participant) => participant.setAudioContext(this.audioContext));
    }

    const newContextIsRunning = this.audioContext?.state === 'running';
    if (newContextIsRunning !== this.canPlaybackAudio) {
      this.audioEnabled = newContextIsRunning;
      this.emit(RoomEvent.AudioPlaybackStatusChanged, newContextIsRunning);
    }
  }

  private createParticipant(id: string, info?: ParticipantInfo): RemoteParticipant {
    let participant: RemoteParticipant;
    if (info) {
      participant = RemoteParticipant.fromParticipantInfo(this.engine.client, info);
    } else {
      participant = new RemoteParticipant(this.engine.client, id, '', undefined, undefined);
    }
    if (this.options.expWebAudioMix) {
      participant.setAudioContext(this.audioContext);
    }
    return participant;
  }

  private getOrCreateParticipant(id: string, info?: ParticipantInfo): RemoteParticipant {
    if (this.participants.has(id)) {
      return this.participants.get(id) as RemoteParticipant;
    }
    // it's possible for the RTC track to arrive before signaling data
    // when this happens, we'll create the participant and make the track work
    const participant = this.createParticipant(id, info);
    this.participants.set(id, participant);
    if (info) {
      this.identityToSid.set(info.identity, info.sid);
      // if we have valid info and the participant wasn't in the map before, we can assume the participant is new
      // firing here to make sure that `ParticipantConnected` fires before the initial track events
      this.emitWhenConnected(RoomEvent.ParticipantConnected, participant);
    }

    // also forward events
    // trackPublished is only fired for tracks added after both local participant
    // and remote participant joined the room
    participant
      .on(ParticipantEvent.TrackPublished, (trackPublication: RemoteTrackPublication) => {
        this.emitWhenConnected(RoomEvent.TrackPublished, trackPublication, participant);
      })
      .on(
        ParticipantEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication) => {
          // monitor playback status
          if (track.kind === Track.Kind.Audio) {
            track.on(TrackEvent.AudioPlaybackStarted, this.handleAudioPlaybackStarted);
            track.on(TrackEvent.AudioPlaybackFailed, this.handleAudioPlaybackFailed);
          }
          this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
        },
      )
      .on(ParticipantEvent.TrackUnpublished, (publication: RemoteTrackPublication) => {
        this.emitWhenConnected(RoomEvent.TrackUnpublished, publication, participant);
      })
      .on(
        ParticipantEvent.TrackUnsubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackUnsubscribed, track, publication, participant);
        },
      )
      .on(ParticipantEvent.TrackSubscriptionFailed, (sid: string) => {
        this.emit(RoomEvent.TrackSubscriptionFailed, sid, participant);
      })
      .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
        this.emitWhenConnected(RoomEvent.TrackMuted, pub, participant);
      })
      .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
        this.emitWhenConnected(RoomEvent.TrackUnmuted, pub, participant);
      })
      .on(ParticipantEvent.ParticipantMetadataChanged, (metadata: string | undefined) => {
        this.emitWhenConnected(RoomEvent.ParticipantMetadataChanged, metadata, participant);
      })
      .on(ParticipantEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        this.emitWhenConnected(RoomEvent.ConnectionQualityChanged, quality, participant);
      })
      .on(
        ParticipantEvent.ParticipantPermissionsChanged,
        (prevPermissions: ParticipantPermission) => {
          this.emitWhenConnected(
            RoomEvent.ParticipantPermissionsChanged,
            prevPermissions,
            participant,
          );
        },
      )
      .on(ParticipantEvent.TrackSubscriptionStatusChanged, (pub, status) => {
        this.emitWhenConnected(RoomEvent.TrackSubscriptionStatusChanged, pub, status, participant);
      })
      .on(ParticipantEvent.TrackSubscriptionPermissionChanged, (pub, status) => {
        this.emitWhenConnected(
          RoomEvent.TrackSubscriptionPermissionChanged,
          pub,
          status,
          participant,
        );
      });

    // update info at the end after callbacks have been set up
    if (info) {
      participant.updateInfo(info);
    }
    return participant;
  }

  private sendSyncState() {
    if (
      this.engine.subscriber === undefined ||
      this.engine.subscriber.pc.localDescription === null
    ) {
      return;
    }
    const previousAnswer = this.engine.subscriber.pc.localDescription;
    const previousOffer = this.engine.subscriber.pc.remoteDescription;

    /* 1. autosubscribe on, so subscribed tracks = all tracks - unsub tracks,
          in this case, we send unsub tracks, so server add all tracks to this
          subscribe pc and unsub special tracks from it.
       2. autosubscribe off, we send subscribed tracks.
    */
    const autoSubscribe = this.connOptions?.autoSubscribe ?? true;
    const trackSids = new Array<string>();
    this.participants.forEach((participant) => {
      participant.tracks.forEach((track) => {
        if (track.isDesired !== autoSubscribe) {
          trackSids.push(track.trackSid);
        }
      });
    });

    this.engine.client.sendSyncState({
      answer: toProtoSessionDescription({
        sdp: previousAnswer.sdp,
        type: previousAnswer.type,
      }),
      offer: previousOffer
        ? toProtoSessionDescription({
            sdp: previousOffer.sdp,
            type: previousOffer.type,
          })
        : undefined,
      subscription: {
        trackSids,
        subscribe: !autoSubscribe,
        participantTracks: [],
      },
      publishTracks: this.localParticipant.publishedTracksInfo(),
      dataChannels: this.localParticipant.dataChannelsInfo(),
    });
  }

  /**
   * After resuming, we'll need to notify the server of the current
   * subscription settings.
   */
  private updateSubscriptions() {
    for (const p of this.participants.values()) {
      for (const pub of p.videoTracks.values()) {
        if (pub.isSubscribed && pub instanceof RemoteTrackPublication) {
          pub.emitTrackUpdate();
        }
      }
    }
  }

  private setAndEmitConnectionState(state: ConnectionState): boolean {
    if (state === this.state) {
      // unchanged
      return false;
    }
    this.state = state;
    this.emit(RoomEvent.ConnectionStateChanged, this.state);
    return true;
  }

  private emitWhenConnected<E extends keyof RoomEventCallbacks>(
    event: E,
    ...args: Parameters<RoomEventCallbacks[E]>
  ): boolean {
    if (this.state === ConnectionState.Connected) {
      return this.emit(event, ...args);
    }
    return false;
  }

  private onLocalParticipantMetadataChanged = (metadata: string | undefined) => {
    this.emit(RoomEvent.ParticipantMetadataChanged, metadata, this.localParticipant);
  };

  private onLocalTrackMuted = (pub: TrackPublication) => {
    this.emit(RoomEvent.TrackMuted, pub, this.localParticipant);
  };

  private onLocalTrackUnmuted = (pub: TrackPublication) => {
    this.emit(RoomEvent.TrackUnmuted, pub, this.localParticipant);
  };

  private onLocalTrackPublished = (pub: LocalTrackPublication) => {
    this.emit(RoomEvent.LocalTrackPublished, pub, this.localParticipant);
  };

  private onLocalTrackUnpublished = (pub: LocalTrackPublication) => {
    this.emit(RoomEvent.LocalTrackUnpublished, pub, this.localParticipant);
  };

  private onLocalConnectionQualityChanged = (quality: ConnectionQuality) => {
    this.emit(RoomEvent.ConnectionQualityChanged, quality, this.localParticipant);
  };

  private onMediaDevicesError = (e: Error) => {
    this.emit(RoomEvent.MediaDevicesError, e);
  };

  private onLocalParticipantPermissionsChanged = (prevPermissions: ParticipantPermission) => {
    this.emit(RoomEvent.ParticipantPermissionsChanged, prevPermissions, this.localParticipant);
  };

  /**
   * Allows to populate a room with simulated participants.
   * No actual connection to a server will be established, all state is
   * @experimental
   */
  simulateParticipants(options: SimulationOptions) {
    const publishOptions = {
      audio: true,
      video: true,
      ...options.publish,
    };
    const participantOptions = {
      count: 9,
      audio: false,
      video: true,
      aspectRatios: [1.66, 1.7, 1.3],
      ...options.participants,
    };
    this.handleDisconnect();
    this.name = 'simulated-room';
    this.localParticipant.identity = 'simulated-local';
    this.localParticipant.name = 'simulated-local';
    this.setupLocalParticipantEvents();
    this.emit(RoomEvent.SignalConnected);
    this.emit(RoomEvent.Connected);
    this.setAndEmitConnectionState(ConnectionState.Connected);
    if (publishOptions.video) {
      const camPub = new LocalTrackPublication(
        Track.Kind.Video,
        TrackInfo.fromPartial({
          source: TrackSource.CAMERA,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
          name: 'video-dummy',
        }),
        new LocalVideoTrack(
          createDummyVideoStreamTrack(
            160 * participantOptions.aspectRatios[0] ?? 1,
            160,
            true,
            true,
          ),
        ),
      );
      // @ts-ignore
      this.localParticipant.addTrackPublication(camPub);
      this.localParticipant.emit(ParticipantEvent.LocalTrackPublished, camPub);
    }
    if (publishOptions.audio) {
      const audioPub = new LocalTrackPublication(
        Track.Kind.Audio,
        TrackInfo.fromPartial({
          source: TrackSource.MICROPHONE,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
        }),
        new LocalAudioTrack(getEmptyAudioStreamTrack()),
      );
      // @ts-ignore
      this.localParticipant.addTrackPublication(audioPub);
      this.localParticipant.emit(ParticipantEvent.LocalTrackPublished, audioPub);
    }

    for (let i = 0; i < participantOptions.count - 1; i += 1) {
      let info: ParticipantInfo = ParticipantInfo.fromPartial({
        sid: Math.floor(Math.random() * 10_000).toString(),
        identity: `simulated-${i}`,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
        joinedAt: Date.now(),
      });
      const p = this.getOrCreateParticipant(info.identity, info);
      if (participantOptions.video) {
        const dummyVideo = createDummyVideoStreamTrack(
          160 * participantOptions.aspectRatios[i % participantOptions.aspectRatios.length] ?? 1,
          160,
          false,
          true,
        );
        const videoTrack = TrackInfo.fromPartial({
          source: TrackSource.CAMERA,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
        });
        p.addSubscribedMediaTrack(dummyVideo, videoTrack.sid, new MediaStream([dummyVideo]));
        info.tracks = [...info.tracks, videoTrack];
      }
      if (participantOptions.audio) {
        const dummyTrack = getEmptyAudioStreamTrack();
        const audioTrack = TrackInfo.fromPartial({
          source: TrackSource.MICROPHONE,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
        });
        p.addSubscribedMediaTrack(dummyTrack, audioTrack.sid, new MediaStream([dummyTrack]));
        info.tracks = [...info.tracks, audioTrack];
      }

      p.updateInfo(info);
    }
  }

  // /** @internal */
  emit<E extends keyof RoomEventCallbacks>(
    event: E,
    ...args: Parameters<RoomEventCallbacks[E]>
  ): boolean {
    // active speaker updates are too spammy
    if (event !== RoomEvent.ActiveSpeakersChanged) {
      log.debug(`room event ${event}`, { event, args });
    }
    return super.emit(event, ...args);
  }
}

export default Room;

export type RoomEventCallbacks = {
  connected: () => void;
  reconnecting: () => void;
  reconnected: () => void;
  disconnected: (reason?: DisconnectReason) => void;
  /** @deprecated stateChanged has been renamed to connectionStateChanged */
  stateChanged: (state: ConnectionState) => void;
  connectionStateChanged: (state: ConnectionState) => void;
  mediaDevicesChanged: () => void;
  participantConnected: (participant: RemoteParticipant) => void;
  participantDisconnected: (participant: RemoteParticipant) => void;
  trackPublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  trackSubscribed: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  trackSubscriptionFailed: (trackSid: string, participant: RemoteParticipant) => void;
  trackUnpublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  trackUnsubscribed: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  trackMuted: (publication: TrackPublication, participant: Participant) => void;
  trackUnmuted: (publication: TrackPublication, participant: Participant) => void;
  localTrackPublished: (publication: LocalTrackPublication, participant: LocalParticipant) => void;
  localTrackUnpublished: (
    publication: LocalTrackPublication,
    participant: LocalParticipant,
  ) => void;
  participantMetadataChanged: (
    metadata: string | undefined,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  participantPermissionsChanged: (
    prevPermissions: ParticipantPermission,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  activeSpeakersChanged: (speakers: Array<Participant>) => void;
  roomMetadataChanged: (metadata: string) => void;
  dataReceived: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    kind?: DataPacket_Kind,
  ) => void;
  connectionQualityChanged: (quality: ConnectionQuality, participant: Participant) => void;
  mediaDevicesError: (error: Error) => void;
  trackStreamStateChanged: (
    publication: RemoteTrackPublication,
    streamState: Track.StreamState,
    participant: RemoteParticipant,
  ) => void;
  trackSubscriptionPermissionChanged: (
    publication: RemoteTrackPublication,
    status: TrackPublication.PermissionStatus,
    participant: RemoteParticipant,
  ) => void;
  trackSubscriptionStatusChanged: (
    publication: RemoteTrackPublication,
    status: TrackPublication.SubscriptionStatus,
    participant: RemoteParticipant,
  ) => void;
  audioPlaybackChanged: (playing: boolean) => void;
  signalConnected: () => void;
  recordingStatusChanged: (recording: boolean) => void;
  participantEncryptionStatusChanged: (encrypted: boolean, participant?: Participant) => void;
};
