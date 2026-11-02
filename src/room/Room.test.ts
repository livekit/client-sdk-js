import {
  ClientInfo_Capability,
  DisconnectReason,
  JoinResponse,
  LeaveRequest,
  LeaveRequest_Action,
  ParticipantInfo,
  ParticipantInfo_State,
  StreamState as ProtoStreamState,
  StreamStateUpdate,
  SubscriptionError,
  SubscriptionResponse,
  TrackInfo,
  TrackType,
} from '@livekit/protocol';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignalConnectionState, type SignalOptions } from '../api/SignalClient';
import MockMediaStreamTrack from '../test/MockMediaStreamTrack';
import { stubMissingDeflateRawSupport } from '../test/compressionStreamStubs';
import { subscribeToEvents } from '../utils/subscribeToEvents';
import { BackOffStrategy } from './BackOffStrategy';
import RTCEngine from './RTCEngine';
import { RegionUrlProvider } from './RegionUrlProvider';
import { ConnectionState, Room, type RoomEventCallbacks } from './Room';
import { roomConnectOptionDefaults, roomOptionDefaults } from './defaults';
import { ConnectionError, ConnectionErrorReason } from './errors';
import { EngineEvent, ParticipantEvent, RoomEvent } from './events';
import RemoteParticipant from './participant/RemoteParticipant';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import RemoteVideoTrack from './track/RemoteVideoTrack';
import { Track } from './track/Track';
import { Future } from './utils';

describe('Active device switch', () => {
  it('updates devices correctly', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test');
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('updates devices with exact constraint', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test', true);
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('emits changed event', async () => {
    const room = new Room();
    let kind: MediaDeviceKind | undefined;
    let deviceId: string | undefined;
    const deviceChangeHandler = (_kind: MediaDeviceKind, _deviceId: string) => {
      kind = _kind;
      deviceId = _deviceId;
    };
    room.on(RoomEvent.ActiveDeviceChanged, deviceChangeHandler);
    await room.switchActiveDevice('audioinput', 'test', true);

    expect(deviceId).toBe('test');
    expect(kind).toBe('audioinput');
  });
});

describe('Room signaling options', () => {
  /** Drives `connectSignal` with E2EE enabled against a stub engine, returning the `join` mock. */
  async function connectSignalWithE2EE(room: Room) {
    const join = vi.fn().mockResolvedValue({
      joinResponse: new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
      }),
      serverInfo: { version: '1.0.0' },
    });
    const engine = { join };

    (
      room as unknown as {
        slots: { e2eeManager: unknown };
        connectSignal: (
          url: string,
          token: string,
          engine: unknown,
          connectOptions: typeof roomConnectOptionDefaults,
          roomOptions: typeof roomOptionDefaults,
          abortController: AbortController,
        ) => Promise<JoinResponse>;
      }
    ).slots.e2eeManager = {};

    await (
      room as unknown as {
        connectSignal: (
          url: string,
          token: string,
          engine: unknown,
          connectOptions: typeof roomConnectOptionDefaults,
          roomOptions: typeof roomOptionDefaults,
          abortController: AbortController,
        ) => Promise<JoinResponse>;
      }
    ).connectSignal(
      'wss://test.livekit.io',
      'test-token',
      engine,
      roomConnectOptionDefaults,
      roomOptionDefaults,
      new AbortController(),
    );

    return join;
  }

  function expectCapabilities(
    join: ReturnType<typeof vi.fn>,
    clientInfoCapabilities: Array<ClientInfo_Capability>,
  ) {
    expect(join).toHaveBeenCalledWith(
      'wss://test.livekit.io',
      'test-token',
      expect.objectContaining({
        clientInfoCapabilities,
        e2eeEnabled: true,
      }),
      expect.any(AbortSignal),
      false,
    );
  }

  it('advertises packet trailer capability when E2EE can handle trailers', async () => {
    const join = await connectSignalWithE2EE(new Room());

    expectCapabilities(join, [
      ClientInfo_Capability.CAP_PACKET_TRAILER,
      ClientInfo_Capability.CAP_COMPRESSION_DEFLATE_RAW,
    ]);
  });

  it('does not advertise deflate-raw compression when the runtime cannot decompress it', async () => {
    const restoreCompressionStreams = stubMissingDeflateRawSupport();
    try {
      const join = await connectSignalWithE2EE(new Room());

      // Otherwise peers would compress what they send us and we'd have to drop it.
      expectCapabilities(join, [ClientInfo_Capability.CAP_PACKET_TRAILER]);
    } finally {
      restoreCompressionStreams();
    }
  });
});

describe('Room lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Tear down the mocked mediaDevices so other tests see the env they
    // expected (happy-dom does not provide navigator.mediaDevices by default).
    if ((navigator as { mediaDevices?: unknown }).mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
    }
  });

  it('wraps the constructor-registered devicechange listener in a WeakRef so the Room is GC-eligible (#1940)', async () => {
    // happy-dom does not provide navigator.mediaDevices. Install a minimal
    // EventTarget stand-in so the constructor takes the listener-registration
    // branch and we can observe the registered listener.
    const mediaDevices = new EventTarget() as EventTarget & {
      addEventListener: EventTarget['addEventListener'];
      removeEventListener: EventTarget['removeEventListener'];
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });

    const addSpy = vi.spyOn(mediaDevices, 'addEventListener');
    const derefSpy = vi.spyOn(WeakRef.prototype, 'deref');
    const cleanupRegistrySpy = Room.cleanupRegistry
      ? vi.spyOn(Room.cleanupRegistry, 'register')
      : undefined;

    const room = new Room();
    const handleDeviceChangeSpy = vi.spyOn(
      room as unknown as { handleDeviceChange: (ev: Event) => void },
      'handleDeviceChange',
    );

    // Constructor must register exactly one devicechange listener with AbortSignal teardown.
    const deviceChangeAdds = addSpy.mock.calls.filter(([type]) => type === 'devicechange');
    expect(deviceChangeAdds).toHaveLength(1);
    const listener = deviceChangeAdds[0][1] as EventListener;
    const addOptions = deviceChangeAdds[0][2] as AddEventListenerOptions | undefined;
    expect(addOptions?.signal).toBeInstanceOf(AbortSignal);

    // FinalizationRegistry must be registered with the Room as the target so the
    // cleanup callback fires when the user drops their Room reference.
    if (Room.cleanupRegistry) {
      expect(cleanupRegistrySpy).toHaveBeenCalledWith(room, expect.any(AbortController));
    }

    // While the WeakRef still derefs to the Room, the listener forwards to handleDeviceChange.
    listener.call(null, new Event('devicechange'));
    expect(handleDeviceChangeSpy).toHaveBeenCalledTimes(1);

    // Simulate the Room being GC'd by forcing deref to return undefined; the
    // listener must short-circuit instead of calling handleDeviceChange.
    derefSpy.mockReturnValue(undefined);
    listener.call(null, new Event('devicechange'));
    expect(handleDeviceChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a direct devicechange listener when WeakRef/FinalizationRegistry are unavailable (#1944)', async () => {
    const mediaDevices = new EventTarget() as EventTarget & {
      addEventListener: EventTarget['addEventListener'];
      removeEventListener: EventTarget['removeEventListener'];
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });

    // Simulate a legacy browser by stubbing out cleanupRegistry.
    const originalRegistry = Room.cleanupRegistry;
    Object.defineProperty(Room, 'cleanupRegistry', {
      configurable: true,
      value: false,
    });

    try {
      const addSpy = vi.spyOn(mediaDevices, 'addEventListener');
      const room = new Room();
      const handleDeviceChange = (room as unknown as { handleDeviceChange: () => void })
        .handleDeviceChange;

      const deviceChangeAdds = addSpy.mock.calls.filter(([type]) => type === 'devicechange');
      expect(deviceChangeAdds).toHaveLength(1);
      // The registered listener is the bare handleDeviceChange method (no WeakRef closure).
      expect(deviceChangeAdds[0][1]).toBe(handleDeviceChange);
    } finally {
      Object.defineProperty(Room, 'cleanupRegistry', {
        configurable: true,
        value: originalRegistry,
      });
    }
  });

  it('lets a dropped Room be garbage collected (#2008)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: new EventTarget(),
    });
    // A Room is retained if either the devicechange listener or the registry's held value closes
    // over the constructor's context, so check reachability with a real GC.
    v8.setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;

    const roomRef = new WeakRef(new Room());

    // WeakRef targets stay alive until the current job ends, so yield before each collection
    for (let i = 0; i < 10 && roomRef.deref(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      gc();
    }
    expect(roomRef.deref()).toBeUndefined();
  });
});

describe('remote track subscription', () => {
  it('does not replay a deferred ontrack after the subscription failed', () => {
    const room = new Room();
    room.state = ConnectionState.Connecting;

    const trackSid = 'TR_h264';
    const mediaTrack = { id: trackSid } as MediaStreamTrack;
    const stream = {
      id: `PA_remote|${trackSid}`,
      getTracks: () => [mediaTrack],
    } as unknown as MediaStream;
    const receiver = {} as RTCRtpReceiver;

    room.engine.emit(EngineEvent.MediaTrackAdded, mediaTrack, stream, receiver);

    const replay = vi.spyOn(
      room as unknown as {
        onTrackAdded(
          mediaTrack: MediaStreamTrack,
          stream: MediaStream,
          receiver: RTCRtpReceiver,
        ): void;
      },
      'onTrackAdded',
    );

    room.engine.emit(
      EngineEvent.SubscriptionError,
      new SubscriptionResponse({
        trackSid,
        err: SubscriptionError.SE_CODEC_UNSUPPORTED,
      }),
    );

    room.state = ConnectionState.Connected;
    room.emit(RoomEvent.Connected);

    expect(replay).not.toHaveBeenCalled();
  });
});

describe('stream state updates', () => {
  const participantSid = 'PA_remote';
  const participantIdentity = 'remote-user';
  const trackSid = 'TR_video';

  function setupSubscribedTrack() {
    const room = new Room();
    room.state = ConnectionState.Connected;

    const participant = new RemoteParticipant(
      room.engine.client,
      participantSid,
      participantIdentity,
    );
    const publication = new RemoteTrackPublication(
      Track.Kind.Video,
      new TrackInfo({ sid: trackSid, type: TrackType.VIDEO, name: 'camera' }),
      true,
    );
    publication.setTrack(
      new RemoteVideoTrack(new MockMediaStreamTrack(), trackSid, undefined as never, {}),
    );
    participant.trackPublications.set(trackSid, publication);

    (
      room as unknown as { remoteParticipants: Map<string, RemoteParticipant> }
    ).remoteParticipants.set(participantIdentity, participant);
    (room as unknown as { sidToIdentity: Map<string, string> }).sidToIdentity.set(
      participantSid,
      participantIdentity,
    );

    return { room, participant, publication };
  }

  function pushStreamState(room: Room, state: ProtoStreamState) {
    (
      room as unknown as { handleStreamStateUpdate: (update: StreamStateUpdate) => void }
    ).handleStreamStateUpdate(
      new StreamStateUpdate({
        streamStates: [{ participantSid, trackSid, state }],
      }),
    );
  }

  it('emits TrackStreamStateChanged when the SFU pauses a subscribed track', () => {
    const { room, participant, publication } = setupSubscribedTrack();

    const roomEvents = vi.fn();
    const participantEvents = vi.fn();
    room.on(RoomEvent.TrackStreamStateChanged, roomEvents);
    participant.on(ParticipantEvent.TrackStreamStateChanged, participantEvents);

    pushStreamState(room, ProtoStreamState.PAUSED);

    expect(publication.track?.streamState).toBe(Track.StreamState.Paused);
    expect(roomEvents).toHaveBeenCalledWith(publication, Track.StreamState.Paused, participant);
    expect(participantEvents).toHaveBeenCalledWith(publication, Track.StreamState.Paused);
  });

  it('does not emit TrackStreamStateChanged when the state is unchanged', () => {
    const { room, participant } = setupSubscribedTrack();

    const roomEvents = vi.fn();
    const participantEvents = vi.fn();
    room.on(RoomEvent.TrackStreamStateChanged, roomEvents);
    participant.on(ParticipantEvent.TrackStreamStateChanged, participantEvents);

    // The track starts Active; a redundant ACTIVE update must stay silent.
    pushStreamState(room, ProtoStreamState.ACTIVE);

    expect(roomEvents).not.toHaveBeenCalled();
    expect(participantEvents).not.toHaveBeenCalled();
  });
});

describe('audio context ownership', () => {
  class StubAudioContext {
    state: AudioContextState = 'running';

    closed = false;

    async close() {
      this.closed = true;
      this.state = 'closed';
    }

    async resume() {
      this.state = 'running';
    }
  }

  const created: StubAudioContext[] = [];

  function stubAudioContext() {
    created.length = 0;
    vi.stubGlobal(
      'AudioContext',
      class extends StubAudioContext {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
  }

  /** `acquireAudioContext` and `releaseAudioContext` are private */
  function internals(room: Room) {
    return room as unknown as {
      acquireAudioContext: () => Promise<void>;
      releaseAudioContext: (retained?: unknown[]) => Promise<void>;
      audioContext?: StubAudioContext;
      ownsAudioContext: boolean;
      localParticipant: { setAudioContext: (ctx: AudioContext | undefined) => Promise<void> };
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('closes a context it created for a webAudioMix object that supplies none', async () => {
    stubAudioContext();
    const room = internals(new Room({ webAudioMix: {} }));

    await room.acquireAudioContext();
    expect(created).toHaveLength(1);
    expect(room.ownsAudioContext).toBe(true);
    expect(room.audioContext).toBe(created[0]);

    await room.releaseAudioContext();
    expect(created[0].closed).toBe(true);
    expect(room.audioContext).toBeUndefined();
  });

  it('leaves a supplied context open', async () => {
    stubAudioContext();
    const provided = new StubAudioContext();
    const room = internals(
      new Room({ webAudioMix: { audioContext: provided as unknown as AudioContext } }),
    );

    await room.acquireAudioContext();
    expect(room.ownsAudioContext).toBe(false);
    expect(created).toHaveLength(0);

    await room.releaseAudioContext();
    expect(provided.closed).toBe(false);
  });

  it('closes the context even when a retained track fails to detach', async () => {
    stubAudioContext();
    const room = internals(new Room({ webAudioMix: {} }));
    await room.acquireAudioContext();

    const retained = { setAudioContext: () => Promise.reject(new Error('detach failed')) };
    await room.releaseAudioContext([retained]);

    expect(created[0].closed).toBe(true);
  });

  it('does not build a context for an acquire queued behind a release', async () => {
    stubAudioContext();
    const room = internals(new Room({ webAudioMix: {} }));
    await room.acquireAudioContext();
    expect(created).toHaveLength(1);

    // `startAudio` reads `audioContextReleased` before it waits on the mutex, so its acquire can
    // already be queued behind a disconnect by the time the flag is set
    const released = room.releaseAudioContext();
    const acquired = room.acquireAudioContext();
    await Promise.all([released, acquired]);

    expect(created).toHaveLength(1);
    expect(created[0].closed).toBe(true);
    expect(room.audioContext).toBeUndefined();
  });

  it('closes the outgoing context even when a participant fails to move off it', async () => {
    stubAudioContext();
    const room = internals(new Room({ webAudioMix: {} }));
    await room.acquireAudioContext();

    vi.spyOn(room.localParticipant, 'setAudioContext').mockRejectedValue(new Error('move failed'));
    await room.releaseAudioContext();

    expect(created[0].closed).toBe(true);
  });
});

describe('connection attempt racing disconnect (#2150)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  type AttemptConnection = (
    url: string,
    token: string,
    opts: undefined,
    abortController: AbortController,
  ) => Promise<void>;

  /** Starts a connection attempt whose signal join stays pending until `failJoin` is called. */
  async function startAttempt(room: Room) {
    let failJoin!: () => void;
    vi.spyOn(RTCEngine.prototype, 'join').mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failJoin = () => reject(ConnectionError.cancelled('Connection aborted'));
        }),
    );
    const engine = room.engine;
    const abortController = new AbortController();
    (room as unknown as { abortController: AbortController }).abortController = abortController;
    room.state = ConnectionState.Connecting;
    const attempt = (room as unknown as { attemptConnection: AttemptConnection }).attemptConnection(
      'ws://localhost:7880',
      'token',
      undefined,
      abortController,
    );
    await vi.waitFor(() => expect(failJoin).toBeDefined());
    return { attempt, engine, failJoin };
  }

  it('rejects as cancelled when disconnect() clears the engine mid-join', async () => {
    const room = new Room();
    const { attempt, engine, failJoin } = await startAttempt(room);
    const close = vi.spyOn(engine, 'close');

    await room.disconnect();
    expect(room.engine).toBeUndefined();
    failJoin();

    await expect(attempt).rejects.toMatchObject({ reason: ConnectionErrorReason.Cancelled });
    expect(close).toHaveBeenCalled();
  });

  it('leaves a newer connect() alone when a stale join fails', async () => {
    // connect() bails out unless the runtime looks like it supports WebRTC
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        addTrack() {}
      },
    );
    let failStaleJoin!: () => void;
    vi.spyOn(RTCEngine.prototype, 'join')
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failStaleJoin = () => reject(ConnectionError.cancelled('Connection aborted'));
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    const room = new Room();

    const stale = room.connect('ws://localhost:7880', 'token');
    await vi.waitFor(() => expect(failStaleJoin).toBeDefined());
    await room.disconnect();
    await expect(stale).rejects.toMatchObject({ reason: ConnectionErrorReason.Cancelled });

    room.connect('ws://localhost:7880', 'token').catch(() => {});
    await vi.waitFor(() => expect(RTCEngine.prototype.join).toHaveBeenCalledTimes(2));
    const newerEngine = room.engine;
    const close = vi.spyOn(newerEngine, 'close');
    const disconnected = vi.fn();
    room.on(RoomEvent.Disconnected, disconnected);

    failStaleJoin();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(room.state).toBe(ConnectionState.Connecting);
    expect(room.engine).toBe(newerEngine);
    expect(close).not.toHaveBeenCalled();
    expect(disconnected).not.toHaveBeenCalled();
  });
});

describe('full reconnect failing over to a second region', () => {
  const join = (metadata: string) =>
    new JoinResponse({
      room: { sid: 'RM_test', name: 'test', metadata },
      participant: { sid: 'PA_local', identity: 'local' },
    });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Drives the room as the engine does: each region attempt has a signal the next one aborts. */
  function restarts(room: Room) {
    let attempt: AbortController | undefined;
    return {
      restarting() {
        attempt?.abort();
        attempt = new AbortController();
        room.engine.emit(EngineEvent.Restarting);
      },
      signalRestarted(metadata: string) {
        room.engine.emit(EngineEvent.SignalRestarted, join(metadata), attempt!.signal);
      },
    };
  }

  function setup() {
    const room = new Room();
    room.state = ConnectionState.Connected;
    room.engine.emit(EngineEvent.RoomUpdate, join('old').room!);
    const republish = vi
      .spyOn(room.localParticipant, 'republishAllTracks')
      .mockImplementation(async () => {});
    const roomEvents = subscribeToEvents<RoomEventCallbacks>(room, [
      RoomEvent.Reconnected,
      RoomEvent.RoomMetadataChanged,
    ]);
    return { room, engine: restarts(room), republish, roomEvents };
  }

  /** Holds the next republish open until the returned function is called. */
  function holdNextRepublish(republish: ReturnType<typeof setup>['republish']) {
    let finish!: () => void;
    republish.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    return () => finish();
  }

  it('reports the recovery once, with the changes the connected region reports', async () => {
    const { room, engine, roomEvents } = setup();

    // the first region joins, then its peer connection fails
    engine.restarting();
    engine.signalRestarted('new');
    await flush();
    // the second region joins and connects
    engine.restarting();
    engine.signalRestarted('new');
    await flush();
    room.engine.emit(EngineEvent.Restarted);
    await flush();

    expect(room.state).toBe(ConnectionState.Connected);
    await roomEvents.waitFor(RoomEvent.Reconnected);
    expect(roomEvents.areThereBufferedEvents(RoomEvent.Reconnected)).toBe(false);
    expect(await roomEvents.waitFor(RoomEvent.RoomMetadataChanged)).toBe('new');
    expect(roomEvents.areThereBufferedEvents(RoomEvent.RoomMetadataChanged)).toBe(false);
    await room.disconnect();
  });

  it('reports the recovery once when the failed region republishes past its failure', async () => {
    const { room, engine, republish, roomEvents } = setup();
    const finishFirstRepublish = holdNextRepublish(republish);

    engine.restarting();
    engine.signalRestarted('new');
    await flush();
    engine.restarting();
    finishFirstRepublish();
    await flush();
    engine.signalRestarted('new');
    await flush();
    expect(roomEvents.areThereBufferedEvents(RoomEvent.Reconnected)).toBe(false);

    room.engine.emit(EngineEvent.Restarted);
    await flush();

    await roomEvents.waitFor(RoomEvent.Reconnected);
    expect(roomEvents.areThereBufferedEvents(RoomEvent.Reconnected)).toBe(false);
    await room.disconnect();
  });

  it('leaves a restart alone that began while an earlier one was still republishing', async () => {
    const { room, engine, republish, roomEvents } = setup();
    const finishFirstRepublish = holdNextRepublish(republish);
    // the engine reports a pending reconnect for as long as an attempt runs
    let attemptRunning = true;
    vi.spyOn(room.engine, 'pendingReconnect', 'get').mockImplementation(() => attemptRunning);

    // the first restart connects while its republish is still running
    engine.restarting();
    engine.signalRestarted('a');
    await flush();
    room.engine.emit(EngineEvent.Restarted);
    attemptRunning = false;
    await flush();
    // a second restart begins before that republish ends
    attemptRunning = true;
    engine.restarting();
    finishFirstRepublish();
    await flush();
    expect(room.state).toBe(ConnectionState.Reconnecting);
    expect(roomEvents.areThereBufferedEvents(RoomEvent.Reconnected)).toBe(false);

    // the second restart fails over from region c to region d
    engine.signalRestarted('c');
    await flush();
    engine.restarting();
    engine.signalRestarted('c');
    await flush();
    room.engine.emit(EngineEvent.Restarted);
    attemptRunning = false;
    await flush();

    expect(room.state).toBe(ConnectionState.Connected);
    await roomEvents.waitFor(RoomEvent.Reconnected);
    expect(roomEvents.areThereBufferedEvents(RoomEvent.Reconnected)).toBe(false);
    expect(await roomEvents.waitFor(RoomEvent.RoomMetadataChanged)).toBe('c');
    expect(roomEvents.areThereBufferedEvents(RoomEvent.RoomMetadataChanged)).toBe(false);
    await room.disconnect();
  });
});

describe('server leave during connect()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    BackOffStrategy.getInstance().resetAll();
  });

  /**
   * Starts `connect()` against a LiveKit Cloud URL whose signal join succeeds but whose transports
   * never connect: the attempt only ends through its abort signal, or once the test lets the peer
   * connection timeout elapse (after which every transport wait times out right away).
   */
  async function connectUntilTransportWait() {
    // connect() bails out unless the runtime looks like it supports WebRTC
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        addTrack() {}
      },
    );
    vi.spyOn(RegionUrlProvider.prototype, 'fetchRegionSettings').mockReturnValue(
      new Promise(() => {}),
    );
    const getNextBestRegionUrl = vi
      .spyOn(RegionUrlProvider.prototype, 'getNextBestRegionUrl')
      .mockResolvedValueOnce('wss://test-project-other-region.livekit.cloud')
      .mockResolvedValue(null);
    const join = vi.spyOn(RTCEngine.prototype, 'join').mockImplementation(async function (
      this: RTCEngine,
    ) {
      // the real join wires the signal callbacks, among them the server leave handler
      (this as unknown as { setupSignalClientCallbacks: () => void }).setupSignalClientCallbacks();
      return {
        joinResponse: new JoinResponse({
          room: { name: 'test-room', sid: 'room-sid' },
          participant: { sid: 'participant-sid', identity: 'test-user' },
        }),
        serverInfo: { version: '1.0.0' },
      };
    });
    let timedOut = false;
    const pendingWaits: Array<() => void> = [];
    vi.spyOn(RTCEngine.prototype, 'waitForPCInitialConnection').mockImplementation(
      (_timeout, abortController) =>
        new Promise<void>((_, reject) => {
          const timeOut = () =>
            reject(ConnectionError.internal('could not establish pc connection'));
          if (timedOut) {
            timeOut();
            return;
          }
          abortController?.signal.addEventListener('abort', () =>
            reject(ConnectionError.cancelled('room connection has been cancelled')),
          );
          pendingWaits.push(timeOut);
        }),
    );

    const room = new Room();
    const outcome = room.connect('wss://test-project.livekit.cloud', 'token').then(
      () => 'connected',
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(pendingWaits).toHaveLength(1));

    const elapsePeerConnectionTimeout = () => {
      timedOut = true;
      pendingWaits.forEach((timeOut) => timeOut());
    };
    return { room, outcome, join, getNextBestRegionUrl, elapsePeerConnectionTimeout };
  }

  /** What the signal client does with a server `leave` (another session took this identity). */
  function receiveDuplicateIdentityLeave(room: Room) {
    room.engine.client.onLeave?.(
      new LeaveRequest({
        action: LeaveRequest_Action.DISCONNECT,
        reason: DisconnectReason.DUPLICATE_IDENTITY,
      }),
    );
  }

  it('cancels the attempt instead of rejoining another region with the same token', async () => {
    const { room, outcome, join, getNextBestRegionUrl, elapsePeerConnectionTimeout } =
      await connectUntilTransportWait();
    const connected = vi.fn();
    room.on(RoomEvent.Connected, connected);

    receiveDuplicateIdentityLeave(room);
    expect(room.state).toBe(ConnectionState.Disconnected);
    elapsePeerConnectionTimeout();

    const error = await outcome;
    expect(join).toHaveBeenCalledTimes(1);
    expect(getNextBestRegionUrl).not.toHaveBeenCalled();
    expect(error).toMatchObject({ reason: ConnectionErrorReason.Cancelled });
    expect(room.state).toBe(ConnectionState.Disconnected);
    expect(connected).not.toHaveBeenCalled();
  });

  it('leaves no attempt running when disconnect() follows the leave', async () => {
    const { room, outcome, join, elapsePeerConnectionTimeout } = await connectUntilTransportWait();

    receiveDuplicateIdentityLeave(room);
    // the room already reports Disconnected, so this returns early
    await room.disconnect();
    elapsePeerConnectionTimeout();

    const error = await outcome;
    expect(join).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ reason: ConnectionErrorReason.Cancelled });
  });
});

describe('events during a full reconnect (#2183)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface EngineInternals {
    _isClosed: boolean;
    url: string;
    token: string;
    signalOpts: SignalOptions;
    pcState: number;
    configure: () => Promise<void>;
    waitForPCReconnected: () => Promise<void>;
  }

  /**
   * Starts a full reconnect on a connected room whose engine still reports its (old) peer
   * connection as connected, as after a signal-only drop. The restart parks in
   * `waitForPCReconnected` until `finishPCReconnect` is called.
   */
  async function startFullReconnect() {
    const room = new Room({ reconnectPolicy: { nextRetryDelayInMs: () => 0 } });
    room.state = ConnectionState.Connected;
    const engine = room.engine;
    const internals = engine as unknown as EngineInternals;
    internals._isClosed = false;
    internals.url = 'wss://test.livekit.io';
    internals.token = 'test-token';
    internals.signalOpts = { autoSubscribe: true, maxRetries: 1, websocketTimeout: 15_000 };
    // PCState.Connected, left over from the session being replaced
    internals.pcState = 1;
    vi.spyOn(internals, 'configure').mockResolvedValue();
    vi.spyOn(engine.client, 'sendLeave').mockResolvedValue();
    vi.spyOn(engine.client, 'currentState', 'get').mockReturnValue(SignalConnectionState.CONNECTED);
    vi.spyOn(engine.client, 'join').mockResolvedValue(
      new JoinResponse({
        participant: new ParticipantInfo({ sid: 'PA_local', identity: 'local' }),
        subscriberPrimary: true,
      }),
    );
    const pcReconnecting = new Future<void, Error>();
    const pcReconnected = new Future<void, Error>();
    vi.spyOn(internals, 'waitForPCReconnected').mockImplementation(async () => {
      pcReconnecting.resolve?.();
      await pcReconnected.promise;
    });
    const restarted = new Future<void, Error>();
    engine.once(EngineEvent.Restarted, () => restarted.resolve?.());

    const events: string[] = [];
    room.on(RoomEvent.Reconnected, () => events.push('reconnected'));
    room.on(RoomEvent.ParticipantConnected, (p) =>
      events.push(`participantConnected:${p.identity}`),
    );

    engine.reconnect();
    await pcReconnecting.promise;
    // let the room's SignalRestarted handler run as far as it will
    await new Promise((resolve) => setTimeout(resolve, 0));

    const finishPCReconnect = async () => {
      pcReconnected.resolve?.();
      await restarted.promise;
      await vi.waitFor(() => expect(engine.pendingReconnect).toBe(false));
    };
    return { room, engine, events, finishPCReconnect };
  }

  it('does not report the room reconnected before the engine restart completes', async () => {
    const { room, events, finishPCReconnect } = await startFullReconnect();

    expect(room.state).toBe(ConnectionState.Reconnecting);
    expect(events).toEqual([]);

    await finishPCReconnect();

    expect(room.state).toBe(ConnectionState.Connected);
    expect(events).toEqual(['reconnected']);
  });

  it('delivers participant events that arrive while the restart is settling', async () => {
    const { room, engine, events, finishPCReconnect } = await startFullReconnect();

    // a remote participant (re)joins while the engine is still waiting on the transports
    engine.emit(EngineEvent.ParticipantUpdate, [
      new ParticipantInfo({
        sid: 'PA_remote',
        identity: 'remote',
        state: ParticipantInfo_State.ACTIVE,
      }),
    ]);
    expect(events).toEqual([]);

    await finishPCReconnect();

    expect(events).toEqual(['reconnected', 'participantConnected:remote']);
    expect((room as unknown as { bufferedEvents: unknown[] }).bufferedEvents).toEqual([]);
  });
});
