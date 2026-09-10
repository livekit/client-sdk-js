import {
  ClientInfo_Capability,
  DataPacket,
  DataStream_Chunk,
  DataStream_Header,
  DataStream_TextHeader,
  DataStream_Trailer,
  Encryption_Type,
  JoinResponse,
  StreamState as ProtoStreamState,
  StreamStateUpdate,
  SubscriptionError,
  SubscriptionResponse,
  TrackInfo,
  TrackSource,
  TrackType,
  Transcription,
  TranscriptionSegment as TranscriptionSegmentModel,
} from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MockMediaStreamTrack from '../test/MockMediaStreamTrack';
import Room, { ConnectionState } from './Room';
import { roomConnectOptionDefaults, roomOptionDefaults } from './defaults';
import { EngineEvent, ParticipantEvent, RoomEvent, TrackEvent } from './events';
import RemoteParticipant from './participant/RemoteParticipant';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import RemoteVideoTrack from './track/RemoteVideoTrack';
import { Track } from './track/Track';

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
  it('advertises packet trailer capability when E2EE can handle trailers', async () => {
    const room = new Room();
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
        e2eeManager: unknown;
        connectSignal: (
          url: string,
          token: string,
          engine: unknown,
          connectOptions: typeof roomConnectOptionDefaults,
          roomOptions: typeof roomOptionDefaults,
          abortController: AbortController,
        ) => Promise<JoinResponse>;
      }
    ).e2eeManager = {};

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

    expect(join).toHaveBeenCalledWith(
      'wss://test.livekit.io',
      'test-token',
      expect.objectContaining({
        clientInfoCapabilities: [
          ClientInfo_Capability.CAP_PACKET_TRAILER,
          ClientInfo_Capability.CAP_COMPRESSION_DEFLATE_RAW,
        ],
        e2eeEnabled: true,
      }),
      expect.any(AbortSignal),
      false,
    );
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
      expect(cleanupRegistrySpy).toHaveBeenCalledWith(room, expect.any(Function));
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

describe('transcription back-conversion', () => {
  const agentIdentity = 'agent-1';
  const trackSid = 'TR_mic';

  /** A connected room with one remote participant publishing a microphone track. */
  function setupRoom() {
    const room = new Room();
    room.state = ConnectionState.Connected;
    (
      room as unknown as { incomingDataStreamManager: { setConnected: (c: boolean) => void } }
    ).incomingDataStreamManager.setConnected(true);

    const participant = new RemoteParticipant(room.engine.client, 'PA_agent', agentIdentity);
    const publication = new RemoteTrackPublication(
      Track.Kind.Audio,
      new TrackInfo({
        sid: trackSid,
        type: TrackType.AUDIO,
        name: 'roomio_audio',
        source: TrackSource.MICROPHONE,
      }),
      true,
    );
    participant.trackPublications.set(trackSid, publication);
    (
      room as unknown as { remoteParticipants: Map<string, RemoteParticipant> }
    ).remoteParticipants.set(agentIdentity, participant);

    return { room, participant, publication };
  }

  function pushPacket(room: Room, packet: DataPacket) {
    (
      room as unknown as {
        handleDataPacket: (packet: DataPacket, encryptionType: Encryption_Type) => void;
      }
    ).handleDataPacket(packet, Encryption_Type.NONE);
  }

  /** Publishes a complete single-chunk `lk.transcription` stream from `senderIdentity`. */
  function pushTranscriptionStream(
    room: Room,
    senderIdentity: string,
    text: string,
    attributes: Record<string, string>,
  ) {
    const streamId = crypto.randomUUID();
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamHeader',
          value: new DataStream_Header({
            streamId,
            topic: 'lk.transcription',
            mimeType: 'text/plain',
            timestamp: 0n,
            attributes,
            contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
          }),
        },
      }),
    );
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamChunk',
          value: new DataStream_Chunk({
            streamId,
            chunkIndex: 0n,
            content: new TextEncoder().encode(text),
          }),
        },
      }),
    );
    pushPacket(
      room,
      new DataPacket({
        participantIdentity: senderIdentity,
        value: {
          case: 'streamTrailer',
          value: new DataStream_Trailer({ streamId }),
        },
      }),
    );
  }

  it('ignores legacy Transcription data packets', () => {
    const { room } = setupRoom();
    const received: Array<unknown> = [];
    room.on(RoomEvent.TranscriptionReceived, (segments) => received.push(segments));

    pushPacket(
      room,
      new DataPacket({
        participantIdentity: agentIdentity,
        value: {
          case: 'transcription',
          value: new Transcription({
            transcribedParticipantIdentity: agentIdentity,
            trackId: trackSid,
            segments: [
              new TranscriptionSegmentModel({ id: 'SG_legacy', text: 'legacy', final: true }),
            ],
          }),
        },
      }),
    );

    expect(received).toHaveLength(0);
  });

  it('emits TranscriptionReceived from an lk.transcription stream', async () => {
    const { room, participant, publication } = setupRoom();
    const roomEvents: Array<{ segments: Array<{ text: string }>; identity?: string }> = [];
    const trackEvents: Array<Array<{ text: string }>> = [];
    room.on(RoomEvent.TranscriptionReceived, (segments, p) =>
      roomEvents.push({ segments, identity: p?.identity }),
    );
    publication.on(TrackEvent.TranscriptionReceived, (segments) => trackEvents.push(segments));

    pushTranscriptionStream(room, agentIdentity, 'Hello world', {
      'lk.segment_id': 'SG_1',
      'lk.transcribed_track_id': trackSid,
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(roomEvents.length).toBeGreaterThan(0);
    expect(roomEvents[0].segments[0].text).toBe('Hello world');
    expect(roomEvents[0].identity).toBe(participant.identity);
    expect(trackEvents.length).toBeGreaterThan(0);
    expect(trackEvents[0][0].text).toBe('Hello world');
  });

  it("resolves the publication from the speaker's mic track when the attribute is absent", async () => {
    const { room, publication } = setupRoom();
    const trackEvents: Array<Array<{ text: string }>> = [];
    publication.on(TrackEvent.TranscriptionReceived, (segments) => trackEvents.push(segments));

    pushTranscriptionStream(room, agentIdentity, 'No track attribute', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackEvents.length).toBeGreaterThan(0);
    expect(trackEvents[0][0].text).toBe('No track attribute');
  });

  it('still delivers lk.transcription to an application text stream handler', async () => {
    const { room } = setupRoom();
    const appTexts: Array<string> = [];
    room.registerTextStreamHandler('lk.transcription', async (reader) => {
      appTexts.push(await reader.readAll());
    });

    pushTranscriptionStream(room, agentIdentity, 'Hello world', {
      'lk.segment_id': 'SG_1',
      'lk.transcription_final': 'true',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appTexts).toEqual(['Hello world']);
  });
});
