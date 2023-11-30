import { protoInt64 } from '@bufbuild/protobuf';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import 'webrtc-adapter';
import { EncryptionEvent } from '../e2ee';
import { E2EEManager } from '../e2ee/E2eeManager';
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
  SubscriptionError,
  TrackInfo,
  TrackSource,
  TrackType,
  UserPacket,
} from '../proto/livekit_models_pb';
import {
  ConnectionQualityUpdate,
  JoinResponse,
  LeaveRequest,
  SimulateScenario,
  StreamStateUpdate,
  SubscriptionPermissionUpdate,
  SubscriptionResponse,
} from '../proto/livekit_rtc_pb';
import { getBrowser } from '../utils/browserParser';
import DeviceManager from './DeviceManager';
import RTCEngine from './RTCEngine';
import { RegionUrlProvider } from './RegionUrlProvider';
import {
  audioDefaults,
  publishDefaults,
  roomConnectOptionDefaults,
  roomOptionDefaults,
  videoDefaults,
} from './defaults';
import { ConnectionError, ConnectionErrorReason, UnsupportedServer } from './errors';
import { EngineEvent, ParticipantEvent, RoomEvent, TrackEvent } from './events';
import LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import CriticalTimers from './timers';
import LocalAudioTrack from './track/LocalAudioTrack';
import LocalTrackPublication from './track/LocalTrackPublication';
import LocalVideoTrack from './track/LocalVideoTrack';
import type RemoteTrack from './track/RemoteTrack';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import type { AdaptiveStreamSettings } from './track/types';
import { getNewAudioContext, sourceToKind } from './track/utils';
import type { SimulationOptions, SimulationScenario } from './types';
import {
  Future,
  Mutex,
  createDummyVideoStreamTrack,
  getEmptyAudioStreamTrack,
  isCloud,
  isWeb,
  supportsSetSinkId,
  toHttpUrl,
  unpackStreamId,
  unwrapConstraint,
} from './utils';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

const connectionReconcileFrequency = 2 * 1000;

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

  /** the current participant */
  localParticipant: LocalParticipant;

  /** options of room */
  options: InternalRoomOptions;

  /** reflects the sender encryption status of the local participant */
  isE2EEEnabled: boolean = false;

  private roomInfo?: RoomModel;

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

  private cachedParticipantSids: Array<string>;

  private connectionReconcileInterval?: ReturnType<typeof setInterval>;

  private regionUrlProvider?: RegionUrlProvider;

  private regionUrl?: string;

  private isVideoPlaybackBlocked: boolean = false;

  /**
   * Creates a new Room, the primary construct for a LiveKit session.
   * @param options
   */
  constructor(options?: RoomOptions) {
    super();
    this.setMaxListeners(100);
    this.participants = new Map();
    this.cachedParticipantSids = [];
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

    if (this.options.videoCaptureDefaults.deviceId) {
      this.localParticipant.activeDeviceMap.set(
        'videoinput',
        unwrapConstraint(this.options.videoCaptureDefaults.deviceId),
      );
    }
    if (this.options.audioCaptureDefaults.deviceId) {
      this.localParticipant.activeDeviceMap.set(
        'audioinput',
        unwrapConstraint(this.options.audioCaptureDefaults.deviceId),
      );
    }
    if (this.options.audioOutput?.deviceId) {
      this.switchActiveDevice('audiooutput', unwrapConstraint(this.options.audioOutput.deviceId));
    }

    if (this.options.e2ee) {
      this.setupE2EE();
    }
  }

  /**
   * @experimental
   */
  async setE2EEEnabled(enabled: boolean) {
    if (this.e2eeManager) {
      await Promise.all([this.localParticipant.setE2EEEnabled(enabled)]);
      if (this.localParticipant.identity !== '') {
        this.e2eeManager.setParticipantCryptorEnabled(enabled, this.localParticipant.identity);
      }
    } else {
      throw Error('e2ee not configured, please set e2ee settings within the room options');
    }
  }

  private setupE2EE() {
    if (this.options.e2ee) {
      this.e2eeManager = new E2EEManager(this.options.e2ee);
      this.e2eeManager.on(
        EncryptionEvent.ParticipantEncryptionStatusChanged,
        (enabled, participant) => {
          if (participant instanceof LocalParticipant) {
            this.isE2EEEnabled = enabled;
          }
          this.emit(RoomEvent.ParticipantEncryptionStatusChanged, enabled, participant);
        },
      );
      this.e2eeManager.on(EncryptionEvent.EncryptionError, (error) =>
        this.emit(RoomEvent.EncryptionError, error),
      );
      this.e2eeManager?.setup(this);
    }
  }

  /**
   * if the current room has a participant with `recorder: true` in its JWT grant
   **/
  get isRecording(): boolean {
    return this.roomInfo?.activeRecording ?? false;
  }

  /** server assigned unique room id */
  get sid(): string {
    return this.roomInfo?.sid ?? '';
  }

  /** user assigned name, derived from JWT token */
  get name(): string {
    return this.roomInfo?.name ?? '';
  }

  /** room metadata */
  get metadata(): string | undefined {
    return this.roomInfo?.metadata;
  }

  get numParticipants(): number {
    return this.roomInfo?.numParticipants ?? 0;
  }

  get numPublishers(): number {
    return this.roomInfo?.numPublishers ?? 0;
  }

  private maybeCreateEngine() {
    if (this.engine && !this.engine.isClosed) {
      return;
    }

    this.engine = new RTCEngine(this.options);

    this.engine
      .on(EngineEvent.ParticipantUpdate, this.handleParticipantUpdates)
      .on(EngineEvent.RoomUpdate, this.handleRoomUpdate)
      .on(EngineEvent.SpeakersChanged, this.handleSpeakersChanged)
      .on(EngineEvent.StreamStateChanged, this.handleStreamStateUpdate)
      .on(EngineEvent.ConnectionQualityUpdate, this.handleConnectionQualityUpdate)
      .on(EngineEvent.SubscriptionError, this.handleSubscriptionError)
      .on(EngineEvent.SubscriptionPermissionUpdate, this.handleSubscriptionPermissionUpdate)
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
        this.clearConnectionReconcile();
        if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
          this.emit(RoomEvent.Reconnecting);
        }
        this.cachedParticipantSids = Array.from(this.participants.keys());
      })
      .on(EngineEvent.Resumed, () => {
        this.setAndEmitConnectionState(ConnectionState.Connected);
        this.emit(RoomEvent.Reconnected);
        this.registerConnectionReconcile();
        this.updateSubscriptions();

        // once reconnected, figure out if any participants connected during reconnect and emit events for it
        const diffParticipants = Array.from(this.participants.values()).filter(
          (p) => !this.cachedParticipantSids.includes(p.sid),
        );
        diffParticipants.forEach((p) => this.emit(RoomEvent.ParticipantConnected, p));
        this.cachedParticipantSids = [];
      })
      .on(EngineEvent.SignalResumed, () => {
        if (this.state === ConnectionState.Reconnecting) {
          this.sendSyncState();
        }
      })
      .on(EngineEvent.Restarting, this.handleRestarting)
      .on(EngineEvent.SignalRestarted, this.handleSignalRestarted)
      .on(EngineEvent.DCBufferStatusChanged, (status, kind) => {
        this.emit(RoomEvent.DCBufferStatusChanged, status, kind);
      });

    if (this.localParticipant) {
      this.localParticipant.setupEngine(this.engine);
    }
    if (this.e2eeManager) {
      this.e2eeManager.setupEngine(this.engine);
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
   * prepareConnection should be called as soon as the page is loaded, in order
   * to speed up the connection attempt. This function will
   * - perform DNS resolution and pre-warm the DNS cache
   * - establish TLS connection and cache TLS keys
   *
   * With LiveKit Cloud, it will also determine the best edge data center for
   * the current client to connect to if a token is provided.
   */
  async prepareConnection(url: string, token?: string) {
    if (this.state !== ConnectionState.Disconnected) {
      return;
    }
    log.debug(`prepareConnection to ${url}`);
    try {
      if (isCloud(new URL(url)) && token) {
        this.regionUrlProvider = new RegionUrlProvider(url, token);
        const regionUrl = await this.regionUrlProvider.getNextBestRegionUrl();
        // we will not replace the regionUrl if an attempt had already started
        // to avoid overriding regionUrl after a new connection attempt had started
        if (regionUrl && this.state === ConnectionState.Disconnected) {
          this.regionUrl = regionUrl;
          await fetch(toHttpUrl(regionUrl), { method: 'HEAD' });
          log.debug(`prepared connection to ${regionUrl}`);
        }
      } else {
        await fetch(toHttpUrl(url), { method: 'HEAD' });
      }
    } catch (e) {
      log.warn('could not prepare connection', { error: e });
    }
  }

  connect = async (url: string, token: string, opts?: RoomConnectOptions): Promise<void> => {
    // In case a disconnect called happened right before the connect call, make sure the disconnect is completed first by awaiting its lock
    const unlockDisconnect = await this.disconnectLock.lock();

    if (this.state === ConnectionState.Connected) {
      // when the state is reconnecting or connected, this function returns immediately
      log.info(`already connected to room ${this.name}`);
      unlockDisconnect();
      return Promise.resolve();
    }

    if (this.connectFuture) {
      unlockDisconnect();
      return this.connectFuture.promise;
    }

    this.setAndEmitConnectionState(ConnectionState.Connecting);
    if (this.regionUrlProvider?.getServerUrl().toString() !== url) {
      this.regionUrl = undefined;
      this.regionUrlProvider = undefined;
    }
    if (isCloud(new URL(url))) {
      if (this.regionUrlProvider === undefined) {
        this.regionUrlProvider = new RegionUrlProvider(url, token);
      } else {
        this.regionUrlProvider.updateToken(token);
      }
      // trigger the first fetch without waiting for a response
      // if initial connection fails, this will speed up picking regional url
      // on subsequent runs
      this.regionUrlProvider.fetchRegionSettings().catch((e) => {
        log.warn('could not fetch region settings', { error: e });
      });
    }

    const connectFn = async (
      resolve: () => void,
      reject: (reason: any) => void,
      regionUrl?: string,
    ) => {
      if (this.abortController) {
        this.abortController.abort();
      }

      // explicit creation as local var needed to satisfy TS compiler when passing it to `attemptConnection` further down
      const abortController = new AbortController();
      this.abortController = abortController;

      // at this point the intention to connect has been signalled so we can allow cancelling of the connection via disconnect() again
      unlockDisconnect?.();

      try {
        await this.attemptConnection(regionUrl ?? url, token, opts, abortController);
        this.abortController = undefined;
        resolve();
      } catch (e) {
        if (
          this.regionUrlProvider &&
          e instanceof ConnectionError &&
          e.reason !== ConnectionErrorReason.Cancelled &&
          e.reason !== ConnectionErrorReason.NotAllowed
        ) {
          let nextUrl: string | null = null;
          try {
            nextUrl = await this.regionUrlProvider.getNextBestRegionUrl(
              this.abortController?.signal,
            );
          } catch (error) {
            if (
              error instanceof ConnectionError &&
              (error.status === 401 || error.reason === ConnectionErrorReason.Cancelled)
            ) {
              this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
              reject(error);
              return;
            }
          }
          if (nextUrl) {
            log.info(
              `Initial connection failed with ConnectionError: ${e.message}. Retrying with another region: ${nextUrl}`,
            );
            await connectFn(resolve, reject, nextUrl);
          } else {
            this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
            reject(e);
          }
        } else {
          this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
          reject(e);
        }
      }
    };

    const regionUrl = this.regionUrl;
    this.regionUrl = undefined;
    this.connectFuture = new Future(
      (resolve, reject) => {
        connectFn(resolve, reject, regionUrl);
      },
      () => {
        this.clearConnectionFutures();
      },
    );

    return this.connectFuture.promise;
  };

  private connectSignal = async (
    url: string,
    token: string,
    engine: RTCEngine,
    connectOptions: InternalRoomConnectOptions,
    roomOptions: InternalRoomOptions,
    abortController: AbortController,
  ): Promise<JoinResponse> => {
    const joinResponse = await engine.join(
      url,
      token,
      {
        autoSubscribe: connectOptions.autoSubscribe,
        publishOnly: connectOptions.publishOnly,
        adaptiveStream:
          typeof roomOptions.adaptiveStream === 'object' ? true : roomOptions.adaptiveStream,
        maxRetries: connectOptions.maxRetries,
        e2eeEnabled: !!this.e2eeManager,
        websocketTimeout: connectOptions.websocketTimeout,
      },
      abortController.signal,
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
      roomOptions.dynacast = false;
    }

    return joinResponse;
  };

  private applyJoinResponse = (joinResponse: JoinResponse) => {
    const pi = joinResponse.participant!;

    this.localParticipant.sid = pi.sid;
    this.localParticipant.identity = pi.identity;

    // populate remote participants, these should not trigger new events
    this.handleParticipantUpdates([pi, ...joinResponse.otherParticipants]);

    if (joinResponse.room) {
      this.handleRoomUpdate(joinResponse.room);
    }

    if (this.options.e2ee && this.e2eeManager) {
      this.e2eeManager.setSifTrailer(joinResponse.sifTrailer);
    }
  };

  private attemptConnection = async (
    url: string,
    token: string,
    opts: RoomConnectOptions | undefined,
    abortController: AbortController,
  ) => {
    if (this.state === ConnectionState.Reconnecting) {
      log.info('Reconnection attempt replaced by new connection attempt');
      // make sure we close and recreate the existing engine in order to get rid of any potentially ongoing reconnection attempts
      this.recreateEngine();
    } else {
      // create engine if previously disconnected
      this.maybeCreateEngine();
    }
    if (this.regionUrlProvider?.isCloud()) {
      this.engine.setRegionUrlProvider(this.regionUrlProvider);
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
      const joinResponse = await this.connectSignal(
        url,
        token,
        this.engine,
        this.connOptions,
        this.options,
        abortController,
      );

      this.applyJoinResponse(joinResponse);
      // forward metadata changed for the local participant
      this.setupLocalParticipantEvents();
      this.emit(RoomEvent.SignalConnected);
    } catch (err) {
      await this.engine.close();
      this.recreateEngine();
      const resultingError = new ConnectionError(`could not establish signal connection`);
      if (err instanceof Error) {
        resultingError.message = `${resultingError.message}: ${err.message}`;
      }
      if (err instanceof ConnectionError) {
        resultingError.reason = err.reason;
        resultingError.status = err.status;
      }
      log.debug(`error trying to establish signal connection`, { error: err });
      throw resultingError;
    }

    if (abortController.signal.aborted) {
      await this.engine.close();
      this.recreateEngine();
      throw new ConnectionError(`Connection attempt aborted`);
    }

    try {
      await this.engine.waitForPCInitialConnection(
        this.connOptions.peerConnectionTimeout,
        abortController,
      );
    } catch (e) {
      await this.engine.close();
      this.recreateEngine();
      throw e;
    }

    // also hook unload event
    if (isWeb() && this.options.disconnectOnPageLeave) {
      // capturing both 'pagehide' and 'beforeunload' to capture broadest set of browser behaviors
      window.addEventListener('pagehide', this.onPageLeave);
      window.addEventListener('beforeunload', this.onPageLeave);
    }
    if (isWeb()) {
      document.addEventListener('freeze', this.onPageLeave);
      navigator.mediaDevices?.addEventListener('devicechange', this.handleDeviceChange);
    }
    this.setAndEmitConnectionState(ConnectionState.Connected);
    this.emit(RoomEvent.Connected);
    this.registerConnectionReconcile();
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
      if (!this.engine?.client.isDisconnected) {
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
   * @internal for testing
   */
  async simulateScenario(scenario: SimulationScenario, arg?: any) {
    let postAction = () => {};
    let req: SimulateScenario | undefined;
    switch (scenario) {
      case 'signal-reconnect':
        // @ts-expect-error function is private
        await this.engine.client.handleOnClose('simulate disconnect');
        break;
      case 'speaker':
        req = new SimulateScenario({
          scenario: {
            case: 'speakerUpdate',
            value: 3,
          },
        });
        break;
      case 'node-failure':
        req = new SimulateScenario({
          scenario: {
            case: 'nodeFailure',
            value: true,
          },
        });
        break;
      case 'server-leave':
        req = new SimulateScenario({
          scenario: {
            case: 'serverLeave',
            value: true,
          },
        });
        break;
      case 'migration':
        req = new SimulateScenario({
          scenario: {
            case: 'migration',
            value: true,
          },
        });
        break;
      case 'resume-reconnect':
        this.engine.failNext();
        // @ts-expect-error function is private
        await this.engine.client.handleOnClose('simulate resume-disconnect');
        break;
      case 'full-reconnect':
        this.engine.fullReconnectOnNext = true;
        // @ts-expect-error function is private
        await this.engine.client.handleOnClose('simulate full-reconnect');
        break;
      case 'force-tcp':
      case 'force-tls':
        req = new SimulateScenario({
          scenario: {
            case: 'switchCandidateProtocol',
            value: scenario === 'force-tls' ? 2 : 1,
          },
        });
        postAction = async () => {
          const onLeave = this.engine.client.onLeave;
          if (onLeave) {
            onLeave(
              new LeaveRequest({
                reason: DisconnectReason.CLIENT_INITIATED,
                canReconnect: true,
              }),
            );
          }
        };
        break;
      case 'subscriber-bandwidth':
        if (arg === undefined || typeof arg !== 'number') {
          throw new Error('subscriber-bandwidth requires a number as argument');
        }
        req = new SimulateScenario({
          scenario: {
            case: 'subscriberBandwidth',
            value: BigInt(arg),
          },
        });
        break;
      default:
    }
    if (req) {
      this.engine.client.sendSimulateScenario(req);
      postAction();
    }
  }

  private onPageLeave = async () => {
    await this.disconnect();
  };

  /**
   * Browsers have different policies regarding audio playback. Most requiring
   * some form of user interaction (click/tap/etc).
   * In those cases, audio will be silent until a click/tap triggering one of the following
   * - `startAudio`
   * - `getUserMedia`
   */
  startAudio = async () => {
    const elements: Array<HTMLMediaElement> = [];
    const browser = getBrowser();
    if (browser && browser.os === 'iOS') {
      /**
       * iOS blocks audio element playback if
       * - user is not publishing audio themselves and
       * - no other audio source is playing
       *
       * as a workaround, we create an audio element with an empty track, so that
       * silent audio is always playing
       */
      const audioId = 'livekit-dummy-audio-el';
      let dummyAudioEl = document.getElementById(audioId) as HTMLAudioElement | null;
      if (!dummyAudioEl) {
        dummyAudioEl = document.createElement('audio');
        dummyAudioEl.id = audioId;
        dummyAudioEl.autoplay = true;
        dummyAudioEl.hidden = true;
        const track = getEmptyAudioStreamTrack();
        track.enabled = true;
        const stream = new MediaStream([track]);
        dummyAudioEl.srcObject = stream;
        document.addEventListener('visibilitychange', () => {
          if (!dummyAudioEl) {
            return;
          }
          // set the srcObject to null on page hide in order to prevent lock screen controls to show up for it
          dummyAudioEl.srcObject = document.hidden ? null : stream;
        });
        document.body.append(dummyAudioEl);
        this.once(RoomEvent.Disconnected, () => {
          dummyAudioEl?.remove();
        });
      }
      elements.push(dummyAudioEl);
    }

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
      await Promise.all([
        this.acquireAudioContext(),
        ...elements.map((e) => {
          e.muted = false;
          return e.play();
        }),
      ]);
      this.handleAudioPlaybackStarted();
    } catch (err) {
      this.handleAudioPlaybackFailed(err);
      throw err;
    }
  };

  startVideo = async () => {
    for (const p of this.participants.values()) {
      p.videoTracks.forEach((tr) => {
        tr.track?.attachedElements.forEach((el) => {
          el.play().catch((e) => {
            if (e.name === 'NotAllowedError') {
              log.warn(
                'Resuming video playback failed, make sure you call `startVideo` directly in a user gesture handler',
              );
            }
          });
        });
      });
    }
  };

  /**
   * Returns true if audio playback is enabled
   */
  get canPlaybackAudio(): boolean {
    return this.audioEnabled;
  }

  /**
   * Returns true if video playback is enabled
   */
  get canPlaybackVideo(): boolean {
    return !this.isVideoPlaybackBlocked;
  }

  /**
   * Returns the active audio output device used in this room.
   * @return the previously successfully set audio output device ID or an empty string if the default device is used.
   * @deprecated use `getActiveDevice('audiooutput')` instead
   */
  getActiveAudioOutputDevice(): string {
    return this.options.audioOutput?.deviceId ?? '';
  }

  getActiveDevice(kind: MediaDeviceKind): string | undefined {
    return this.localParticipant.activeDeviceMap.get(kind);
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
  async switchActiveDevice(kind: MediaDeviceKind, deviceId: string, exact: boolean = false) {
    let deviceHasChanged = false;
    let success = true;
    const deviceConstraint = exact ? { exact: deviceId } : deviceId;
    if (kind === 'audioinput') {
      const prevDeviceId = this.options.audioCaptureDefaults!.deviceId;
      this.options.audioCaptureDefaults!.deviceId = deviceConstraint;
      deviceHasChanged = prevDeviceId !== deviceConstraint;
      const tracks = Array.from(this.localParticipant.audioTracks.values()).filter(
        (track) => track.source === Track.Source.Microphone,
      );
      try {
        success = (
          await Promise.all(tracks.map((t) => t.audioTrack?.setDeviceId(deviceConstraint)))
        ).every((val) => val === true);
      } catch (e) {
        this.options.audioCaptureDefaults!.deviceId = prevDeviceId;
        throw e;
      }
    } else if (kind === 'videoinput') {
      const prevDeviceId = this.options.videoCaptureDefaults!.deviceId;
      this.options.videoCaptureDefaults!.deviceId = deviceConstraint;
      deviceHasChanged = prevDeviceId !== deviceConstraint;
      const tracks = Array.from(this.localParticipant.videoTracks.values()).filter(
        (track) => track.source === Track.Source.Camera,
      );
      try {
        success = (
          await Promise.all(tracks.map((t) => t.videoTrack?.setDeviceId(deviceConstraint)))
        ).every((val) => val === true);
      } catch (e) {
        this.options.videoCaptureDefaults!.deviceId = prevDeviceId;
        throw e;
      }
    } else if (kind === 'audiooutput') {
      if (
        (!supportsSetSinkId() && !this.options.expWebAudioMix) ||
        (this.options.expWebAudioMix && this.audioContext && !('setSinkId' in this.audioContext))
      ) {
        throw new Error('cannot switch audio output, setSinkId not supported');
      }
      this.options.audioOutput ??= {};
      const prevDeviceId = this.options.audioOutput.deviceId;
      this.options.audioOutput.deviceId = deviceId;
      deviceHasChanged = prevDeviceId !== deviceConstraint;

      try {
        if (this.options.expWebAudioMix) {
          // @ts-expect-error setSinkId is not yet in the typescript type of AudioContext
          this.audioContext?.setSinkId(deviceId);
        } else {
          await Promise.all(
            Array.from(this.participants.values()).map((p) => p.setAudioOutput({ deviceId })),
          );
        }
      } catch (e) {
        this.options.audioOutput.deviceId = prevDeviceId;
        throw e;
      }
    }
    if (deviceHasChanged && success) {
      this.localParticipant.activeDeviceMap.set(kind, deviceId);
      this.emit(RoomEvent.ActiveDeviceChanged, kind, deviceId);
    }

    return success;
  }

  private setupLocalParticipantEvents() {
    this.localParticipant
      .on(ParticipantEvent.ParticipantMetadataChanged, this.onLocalParticipantMetadataChanged)
      .on(ParticipantEvent.ParticipantNameChanged, this.onLocalParticipantNameChanged)
      .on(ParticipantEvent.TrackMuted, this.onLocalTrackMuted)
      .on(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted)
      .on(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished)
      .on(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
      .on(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged)
      .on(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError)
      .on(ParticipantEvent.AudioStreamAcquired, this.startAudio)
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
    let streamId = parts[1];
    let trackId = mediaTrack.id;
    // firefox will get streamId (pID|trackId) instead of (pID|streamId) as it doesn't support sync tracks by stream
    // and generates its own track id instead of infer from sdp track id.
    if (streamId && streamId.startsWith('TR')) trackId = streamId;

    if (participantId === this.localParticipant.sid) {
      log.warn('tried to create RemoteParticipant for local participant');
      return;
    }

    const participant = this.participants.get(participantId) as RemoteParticipant | undefined;

    if (!participant) {
      log.error(
        `Tried to add a track for a participant, that's not present. Sid: ${participantId}`,
      );
      return;
    }

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
    this.clearConnectionReconcile();
    // also unwind existing participants & existing subscriptions
    for (const p of this.participants.values()) {
      this.handleParticipantDisconnected(p.sid, p);
    }

    if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
      this.emit(RoomEvent.Reconnecting);
    }
  };

  private handleSignalRestarted = async (joinResponse: JoinResponse) => {
    log.debug(`signal reconnected to server`, {
      region: joinResponse.serverRegion,
    });

    this.cachedParticipantSids = [];
    this.applyJoinResponse(joinResponse);

    try {
      // unpublish & republish tracks
      const localPubs: LocalTrackPublication[] = [];
      this.localParticipant.tracks.forEach((pub) => {
        if (pub.track) {
          localPubs.push(pub);
        }
      });

      await Promise.all(
        localPubs.map(async (pub) => {
          const track = pub.track!;
          this.localParticipant.unpublishTrack(track, false);
          if (!track.isMuted) {
            if (
              (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) &&
              track.source !== Track.Source.ScreenShare &&
              track.source !== Track.Source.ScreenShareAudio &&
              !track.isUserProvided
            ) {
              // we need to restart the track before publishing, often a full reconnect
              // is necessary because computer had gone to sleep.
              log.debug('restarting existing track', {
                track: pub.trackSid,
              });
              await track.restartTrack();
            }
            log.debug('publishing new track', {
              track: pub.trackSid,
            });
            await this.localParticipant.publishTrack(track, pub.options);
          }
        }),
      );
    } catch (error) {
      log.error('error trying to re-publish tracks after reconnection', { error });
    }

    try {
      await this.engine.waitForRestarted();
      log.debug(`fully reconnected to server`, {
        region: joinResponse.serverRegion,
      });
    } catch {
      // reconnection failed, handleDisconnect is being invoked already, just return here
      return;
    }
    this.setAndEmitConnectionState(ConnectionState.Connected);
    this.emit(RoomEvent.Reconnected);
    this.registerConnectionReconcile();

    // emit participant connected events after connection has been re-established
    this.participants.forEach((participant) => {
      this.emit(RoomEvent.ParticipantConnected, participant);
    });
  };

  private handleDisconnect(shouldStopTracks = true, reason?: DisconnectReason) {
    this.clearConnectionReconcile();
    if (this.state === ConnectionState.Disconnected) {
      return;
    }

    this.regionUrl = undefined;

    try {
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
        .off(ParticipantEvent.ParticipantNameChanged, this.onLocalParticipantNameChanged)
        .off(ParticipantEvent.TrackMuted, this.onLocalTrackMuted)
        .off(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted)
        .off(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished)
        .off(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
        .off(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged)
        .off(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError)
        .off(ParticipantEvent.AudioStreamAcquired, this.startAudio)
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
        window.removeEventListener('beforeunload', this.onPageLeave);
        window.removeEventListener('pagehide', this.onPageLeave);
        window.removeEventListener('freeze', this.onPageLeave);
        navigator.mediaDevices?.removeEventListener('devicechange', this.handleDeviceChange);
      }
    } finally {
      this.setAndEmitConnectionState(ConnectionState.Disconnected);
      this.emit(RoomEvent.Disconnected, reason);
    }
  }

  private handleParticipantUpdates = (participantInfos: ParticipantInfo[]) => {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      if (info.identity === this.localParticipant.identity) {
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

      // when it's disconnected, send updates
      if (info.state === ParticipantInfo_State.DISCONNECTED) {
        this.handleParticipantDisconnected(info.sid, remoteParticipant);
      } else {
        // create participant if doesn't exist
        remoteParticipant = this.getOrCreateParticipant(info.sid, info);
        if (!isNewParticipant) {
          // just update, no events
          remoteParticipant.updateInfo(info);
        }
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
    this.emit(RoomEvent.ParticipantDisconnected, participant);
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

  private handleSubscriptionError = (update: SubscriptionResponse) => {
    const participant = Array.from(this.participants.values()).find((p) =>
      p.tracks.has(update.trackSid),
    );
    if (!participant) {
      return;
    }
    const pub = participant.getTrackPublication(update.trackSid);
    if (!pub) {
      return;
    }

    pub.setSubscriptionError(update.err);
  };

  private handleDataPacket = (userPacket: UserPacket, kind: DataPacket_Kind) => {
    // find the participant
    const participant = this.participants.get(userPacket.participantSid);

    this.emit(RoomEvent.DataReceived, userPacket.payload, participant, kind, userPacket.topic);

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

  private handleVideoPlaybackStarted = () => {
    if (this.isVideoPlaybackBlocked) {
      this.isVideoPlaybackBlocked = false;
      this.emit(RoomEvent.VideoPlaybackStatusChanged, true);
    }
  };

  private handleVideoPlaybackFailed = () => {
    if (!this.isVideoPlaybackBlocked) {
      this.isVideoPlaybackBlocked = true;
      this.emit(RoomEvent.VideoPlaybackStatusChanged, false);
    }
  };

  private handleDeviceChange = async () => {
    this.emit(RoomEvent.MediaDevicesChanged);
  };

  private handleRoomUpdate = (room: RoomModel) => {
    const oldRoom = this.roomInfo;
    this.roomInfo = room;
    if (oldRoom && oldRoom.metadata !== room.metadata) {
      this.emitWhenConnected(RoomEvent.RoomMetadataChanged, room.metadata);
    }
    if (oldRoom?.activeRecording !== room.activeRecording) {
      this.emitWhenConnected(RoomEvent.RecordingStatusChanged, room.activeRecording);
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
    } else if (!this.audioContext || this.audioContext.state === 'closed') {
      // by using an AudioContext, it reduces lag on audio elements
      // https://stackoverflow.com/questions/9811429/html5-audio-tag-on-safari-has-a-delay/54119854#54119854
      this.audioContext = getNewAudioContext() ?? undefined;
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      // for iOS a newly created AudioContext is always in `suspended` state.
      // we try our best to resume the context here, if that doesn't work, we just continue with regular processing
      try {
        await this.audioContext.resume();
      } catch (e: any) {
        log.warn(e);
      }
    }

    if (this.options.expWebAudioMix) {
      this.participants.forEach((participant) => participant.setAudioContext(this.audioContext));
    }

    this.localParticipant.setAudioContext(this.audioContext);

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

  private getOrCreateParticipant(id: string, info: ParticipantInfo): RemoteParticipant {
    if (this.participants.has(id)) {
      return this.participants.get(id) as RemoteParticipant;
    }
    const participant = this.createParticipant(id, info);
    this.participants.set(id, participant);

    this.identityToSid.set(info.identity, info.sid);
    // if we have valid info and the participant wasn't in the map before, we can assume the participant is new
    // firing here to make sure that `ParticipantConnected` fires before the initial track events
    this.emitWhenConnected(RoomEvent.ParticipantConnected, participant);

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
          } else if (track.kind === Track.Kind.Video) {
            track.on(TrackEvent.VideoPlaybackFailed, this.handleVideoPlaybackFailed);
            track.on(TrackEvent.VideoPlaybackStarted, this.handleVideoPlaybackStarted);
          }
          this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
        },
      )
      .on(ParticipantEvent.TrackUnpublished, (publication: RemoteTrackPublication) => {
        this.emit(RoomEvent.TrackUnpublished, publication, participant);
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
      .on(ParticipantEvent.ParticipantNameChanged, (name) => {
        this.emitWhenConnected(RoomEvent.ParticipantNameChanged, name, participant);
      })
      .on(ParticipantEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        this.emitWhenConnected(RoomEvent.ConnectionQualityChanged, quality, participant);
      })
      .on(
        ParticipantEvent.ParticipantPermissionsChanged,
        (prevPermissions?: ParticipantPermission) => {
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
      .on(ParticipantEvent.TrackSubscriptionFailed, (trackSid, error) => {
        this.emit(RoomEvent.TrackSubscriptionFailed, trackSid, participant, error);
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
    const remoteTracks = Array.from(this.participants.values()).reduce((acc, participant) => {
      acc.push(...(participant.getTracks() as RemoteTrackPublication[])); // FIXME would be nice to have this return RemoteTrackPublications directly instead of the type cast
      return acc;
    }, [] as RemoteTrackPublication[]);
    const localTracks = this.localParticipant.getTracks() as LocalTrackPublication[]; // FIXME would be nice to have this return LocalTrackPublications directly instead of the type cast
    this.engine.sendSyncState(remoteTracks, localTracks);
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

  private registerConnectionReconcile() {
    this.clearConnectionReconcile();
    let consecutiveFailures = 0;
    this.connectionReconcileInterval = CriticalTimers.setInterval(() => {
      if (
        // ensure we didn't tear it down
        !this.engine ||
        // engine detected close, but Room missed it
        this.engine.isClosed ||
        // transports failed without notifying engine
        !this.engine.verifyTransport()
      ) {
        consecutiveFailures++;
        log.warn('detected connection state mismatch', { numFailures: consecutiveFailures });
        if (consecutiveFailures >= 3) {
          this.recreateEngine();
          this.handleDisconnect(
            this.options.stopLocalTrackOnUnpublish,
            DisconnectReason.STATE_MISMATCH,
          );
        }
      } else {
        consecutiveFailures = 0;
      }
    }, connectionReconcileFrequency);
  }

  private clearConnectionReconcile() {
    if (this.connectionReconcileInterval) {
      CriticalTimers.clearInterval(this.connectionReconcileInterval);
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

  private onLocalParticipantNameChanged = (name: string) => {
    this.emit(RoomEvent.ParticipantNameChanged, name, this.localParticipant);
  };

  private onLocalTrackMuted = (pub: TrackPublication) => {
    this.emit(RoomEvent.TrackMuted, pub, this.localParticipant);
  };

  private onLocalTrackUnmuted = (pub: TrackPublication) => {
    this.emit(RoomEvent.TrackUnmuted, pub, this.localParticipant);
  };

  private onLocalTrackPublished = async (pub: LocalTrackPublication) => {
    this.emit(RoomEvent.LocalTrackPublished, pub, this.localParticipant);
    if (pub.track instanceof LocalAudioTrack) {
      const trackIsSilent = await pub.track.checkForSilence();
      if (trackIsSilent) {
        this.emit(RoomEvent.LocalAudioSilenceDetected, pub);
      }
    }
    const deviceId = await pub.track?.getDeviceId();
    const deviceKind = sourceToKind(pub.source);
    if (
      deviceKind &&
      deviceId &&
      deviceId !== this.localParticipant.activeDeviceMap.get(deviceKind)
    ) {
      this.localParticipant.activeDeviceMap.set(deviceKind, deviceId);
      this.emit(RoomEvent.ActiveDeviceChanged, deviceKind, deviceId);
    }
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

  private onLocalParticipantPermissionsChanged = (prevPermissions?: ParticipantPermission) => {
    this.emit(RoomEvent.ParticipantPermissionsChanged, prevPermissions, this.localParticipant);
  };

  /**
   * Allows to populate a room with simulated participants.
   * No actual connection to a server will be established, all state is
   * @experimental
   */
  async simulateParticipants(options: SimulationOptions) {
    const publishOptions = {
      audio: true,
      video: true,
      useRealTracks: false,
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
    this.roomInfo = new RoomModel({
      sid: 'RM_SIMULATED',
      name: 'simulated-room',
      emptyTimeout: 0,
      maxParticipants: 0,
      creationTime: protoInt64.parse(new Date().getTime()),
      metadata: '',
      numParticipants: 1,
      numPublishers: 1,
      turnPassword: '',
      enabledCodecs: [],
      activeRecording: false,
    });

    this.localParticipant.updateInfo(
      new ParticipantInfo({
        identity: 'simulated-local',
        name: 'local-name',
      }),
    );
    this.setupLocalParticipantEvents();
    this.emit(RoomEvent.SignalConnected);
    this.emit(RoomEvent.Connected);
    this.setAndEmitConnectionState(ConnectionState.Connected);
    if (publishOptions.video) {
      const camPub = new LocalTrackPublication(
        Track.Kind.Video,
        new TrackInfo({
          source: TrackSource.CAMERA,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
          name: 'video-dummy',
        }),
        new LocalVideoTrack(
          publishOptions.useRealTracks
            ? (
                await window.navigator.mediaDevices.getUserMedia({ video: true })
              ).getVideoTracks()[0]
            : createDummyVideoStreamTrack(
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
        new TrackInfo({
          source: TrackSource.MICROPHONE,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
        }),
        new LocalAudioTrack(
          publishOptions.useRealTracks
            ? (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0]
            : getEmptyAudioStreamTrack(),
        ),
      );
      // @ts-ignore
      this.localParticipant.addTrackPublication(audioPub);
      this.localParticipant.emit(ParticipantEvent.LocalTrackPublished, audioPub);
    }

    for (let i = 0; i < participantOptions.count - 1; i += 1) {
      let info: ParticipantInfo = new ParticipantInfo({
        sid: Math.floor(Math.random() * 10_000).toString(),
        identity: `simulated-${i}`,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
        joinedAt: protoInt64.parse(Date.now()),
      });
      const p = this.getOrCreateParticipant(info.identity, info);
      if (participantOptions.video) {
        const dummyVideo = createDummyVideoStreamTrack(
          160 * participantOptions.aspectRatios[i % participantOptions.aspectRatios.length] ?? 1,
          160,
          false,
          true,
        );
        const videoTrack = new TrackInfo({
          source: TrackSource.CAMERA,
          sid: Math.floor(Math.random() * 10_000).toString(),
          type: TrackType.AUDIO,
        });
        p.addSubscribedMediaTrack(dummyVideo, videoTrack.sid, new MediaStream([dummyVideo]));
        info.tracks = [...info.tracks, videoTrack];
      }
      if (participantOptions.audio) {
        const dummyTrack = getEmptyAudioStreamTrack();
        const audioTrack = new TrackInfo({
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
  trackSubscriptionFailed: (
    trackSid: string,
    participant: RemoteParticipant,
    reason?: SubscriptionError,
  ) => void;
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
  localAudioSilenceDetected: (publication: LocalTrackPublication) => void;
  participantMetadataChanged: (
    metadata: string | undefined,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  participantNameChanged: (name: string, participant: RemoteParticipant | LocalParticipant) => void;
  participantPermissionsChanged: (
    prevPermissions: ParticipantPermission | undefined,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  activeSpeakersChanged: (speakers: Array<Participant>) => void;
  roomMetadataChanged: (metadata: string) => void;
  dataReceived: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    kind?: DataPacket_Kind,
    topic?: string,
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
  videoPlaybackChanged: (playing: boolean) => void;
  signalConnected: () => void;
  recordingStatusChanged: (recording: boolean) => void;
  participantEncryptionStatusChanged: (encrypted: boolean, participant?: Participant) => void;
  encryptionError: (error: Error) => void;
  dcBufferStatusChanged: (isLow: boolean, kind: DataPacket_Kind) => void;
  activeDeviceChanged: (kind: MediaDeviceKind, deviceId: string) => void;
};
