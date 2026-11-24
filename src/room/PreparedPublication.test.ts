import { AudioTrackFeature, ParticipantPermission, TrackInfo } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type InitialPublicationSender,
  type PreparePublicationOptions,
  PreparedPublicationState,
} from './PreparedPublication';
import { Room } from './Room';
import { EngineEvent, ParticipantEvent, TrackEvent } from './events';
import LocalAudioTrack from './track/LocalAudioTrack';
import type LocalTrack from './track/LocalTrack';
import LocalTrackPublication from './track/LocalTrackPublication';
import { Track } from './track/Track';
import { VideoPreset } from './track/options';

type PreparingRoom = {
  prepareSessionPublication(options: PreparePublicationOptions): PreparedPublicationState;
};
const bridge = (room: Room) => ({
  prepare: (options: PreparePublicationOptions) =>
    (room as unknown as PreparingRoom).prepareSessionPublication(options),
});

function fixture() {
  const publication = {} as LocalTrackPublication;
  const publish = vi.fn(async () => publication);
  const release = vi.fn();
  const plan = new PreparedPublicationState(
    { source: Track.Source.Microphone },
    {},
    [],
    'opus',
    true,
    publish,
    release,
  );
  const track = {
    kind: Track.Kind.Audio,
    getSourceTrackSettings: () => ({ channelCount: 1 }),
    stop: vi.fn(),
  } as unknown as LocalTrack;
  const transport = { releaseSender: vi.fn() };
  const engine = {
    isClosed: false,
    pcManager: { publisher: transport },
    cancelPendingTrack: vi.fn(),
    negotiate: vi.fn(async () => {}),
  };
  const transceiver = { stop: vi.fn(), sender: {} };
  const initial = {
    engine,
    transport,
    transceiver,
    accepted: Promise.resolve(new TrackInfo()),
  } as unknown as InitialPublicationSender;
  return { plan, publish, release, track, initial, engine, transceiver, publication };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('prepared publication lifecycle', () => {
  it('does not request capture or publish while preparing', async () => {
    const room = new Room();
    const createTracks = vi.spyOn(room.localParticipant, 'createTracks');
    const publish = vi.spyOn(room.localParticipant, 'publishTrack');
    const plan = bridge(room).prepare({ source: Track.Source.Microphone });
    expect(createTracks).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    await plan.cancel();
    await room.dispose();
  });
  it('uses the declared audio format over default stereo settings', async () => {
    const room = new Room();
    const plan = bridge(room).prepare({
      source: Track.Source.Microphone,
      format: { channelCount: 2 },
    }) as PreparedPublicationState;
    expect(plan.request.stereo).toBe(true);
    expect(() =>
      bridge(room).prepare({
        source: Track.Source.Microphone,
        format: { channelCount: 2 },
        publishOptions: { forceStereo: false },
      }),
    ).toThrow('disagree');
    await plan.cancel();
    await room.dispose();
  });
  it('attaches only after the engine settled the registration', async () => {
    const { plan, track, publish, publication, release } = fixture();
    const attached = plan.attachTrack(track);
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    // capture finished first: the engine must still reserve the sender
    expect(plan.isWaitingForSender).toBe(true);
    plan.skipReservation();
    expect(await attached).toBe(publication);
    expect(track.source).toBe(Track.Source.Microphone);
    expect(release).toHaveBeenCalledOnce();
    await plan.cancel();
    expect(publish).toHaveBeenCalledOnce();
  });
  it('rejects cancellation before registration and never stops caller media', async () => {
    const { plan, track, publish, release } = fixture();
    const attached = plan.attachTrack(track);
    await plan.cancel();
    await expect(attached).rejects.toThrow('cancelled');
    expect(publish).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
  it('keeps a single attachment future for duplicate calls', async () => {
    const { plan, track } = fixture();
    const attached = plan.attachTrack(track);
    track.sender = {} as RTCRtpSender;
    expect(plan.attachTrack(track)).toBe(attached);
    await expect(plan.attachTrack({ kind: Track.Kind.Audio } as LocalTrack)).rejects.toThrow(
      'already has a track',
    );
    await plan.cancel();
    await expect(attached).rejects.toThrow('cancelled');
  });
  it('tears down a negotiated reservation once and releases it', async () => {
    const { plan, initial, engine, transceiver, release } = fixture();
    plan.reserve(initial);
    await plan.cancel();
    await plan.cancel();
    expect(transceiver.stop).toHaveBeenCalledOnce();
    expect(engine.negotiate).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
  it('lets PC teardown own a discarded connection attempt', async () => {
    const { plan, initial, engine, transceiver, track } = fixture();
    plan.reserve(initial);
    plan.fallback();
    expect(engine.cancelPendingTrack).toHaveBeenCalledOnce();
    expect(await plan.senderFor(track, initial.engine)).toBeUndefined();
    await plan.cancel();
    expect(transceiver.stop).not.toHaveBeenCalled();
  });
  it('accepts CID-only codec metadata before media reaches the SFU', async () => {
    const { plan, initial, track } = fixture();
    initial.accepted = Promise.resolve(new TrackInfo({ codecs: [{ cid: 'prepared-cid' }] }));
    plan.reserve(initial);
    expect(await plan.senderFor(track, initial.engine)).toBe(initial);
    plan.fallback();
    await plan.cancel();
  });
  it.each(['codec', 'format', 'connection'])(
    'falls back when %s no longer matches',
    async (reason) => {
      const { plan, initial, track, engine, transceiver } = fixture();
      if (reason === 'codec')
        initial.accepted = Promise.resolve(new TrackInfo({ codecs: [{ mimeType: 'audio/pcmu' }] }));
      if (reason === 'format') track.getSourceTrackSettings = () => ({ channelCount: 2 });
      plan.reserve(initial);
      plan.skipReservation();
      if (reason === 'connection') engine.pcManager.publisher = {};
      expect(await plan.senderFor(track, initial.engine)).toBeUndefined();
      expect(transceiver.stop).toHaveBeenCalledTimes(reason === 'connection' ? 0 : 1);
      await plan.cancel();
    },
  );
  it('rejects installing a sender after cancellation has completed', async () => {
    const { plan, initial } = fixture();
    await plan.cancel();
    expect(() => plan.reserve(initial)).toThrow('cancelled');
    expect(plan.isWaitingForSender).toBe(false);
  });
  it('owns only the preconnect recorder it starts', async () => {
    const { plan, track } = fixture();
    plan.options.preConnectBuffer = true;
    track.startPreConnectBuffer = vi.fn();
    track.stopPreConnectBuffer = vi.fn();
    const attaching = plan.attachTrack(track);
    expect(track.startPreConnectBuffer).toHaveBeenCalledOnce();
    await plan.cancel();
    await expect(attaching).rejects.toThrow('cancelled');
    expect(track.stopPreConnectBuffer).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'keeps early subscriptions past capture delay, cancelled: %s',
    async (cancelled) => {
      vi.useFakeTimers();
      const room = new Room();
      const internals = room as unknown as {
        setupLocalParticipantEvents(): void;
        onLocalTrackPublished(publication: LocalTrackPublication): Promise<void>;
      };
      const plan = bridge(room).prepare({
        source: Track.Source.Microphone,
      }) as PreparedPublicationState;
      const other = bridge(room).prepare({ source: Track.Source.Microphone });
      const { initial, engine } = fixture();
      initial.accepted = Promise.resolve(new TrackInfo({ sid: 'early-sid' }));
      engine.isClosed = true;
      plan.reserve(initial);
      plan.skipReservation();
      await Promise.resolve();
      internals.setupLocalParticipantEvents();
      const subscribed = vi.fn();
      room.localParticipant.on(ParticipantEvent.LocalTrackSubscribed, subscribed);
      room.engine.emit(EngineEvent.LocalTrackSubscribed, 'early-sid');
      await vi.advanceTimersByTimeAsync(11000);
      if (cancelled) await plan.cancel();
      const publication = new LocalTrackPublication(
        Track.Kind.Audio,
        new TrackInfo({ sid: 'early-sid' }),
      );
      await internals.onLocalTrackPublished(publication);
      expect(subscribed).toHaveBeenCalledTimes(cancelled ? 0 : 1);
      await other.cancel();
      await plan.cancel();
      await room.dispose();
      vi.useRealTimers();
    },
  );
  it('keeps unrelated subscription deferral bounded while capture is pending', async () => {
    vi.useFakeTimers();
    const room = new Room();
    const plan = bridge(room).prepare({
      source: Track.Source.Microphone,
    }) as PreparedPublicationState;
    const internals = room as unknown as {
      setupLocalParticipantEvents(): void;
      onLocalTrackPublished(publication: LocalTrackPublication): Promise<void>;
      pendingInitialTrackSubscriptions: Map<string, PreparedPublicationState>;
    };
    internals.setupLocalParticipantEvents();
    const subscribed = vi.fn();
    room.localParticipant.on(ParticipantEvent.LocalTrackSubscribed, subscribed);
    const before = room.localParticipant.listenerCount(ParticipantEvent.LocalTrackPublished);
    room.engine.emit(EngineEvent.LocalTrackSubscribed, 'unrelated-sid');
    expect(internals.pendingInitialTrackSubscriptions.size).toBe(0);
    expect(room.localParticipant.listenerCount(ParticipantEvent.LocalTrackPublished)).toBe(
      before + 1,
    );
    await vi.advanceTimersByTimeAsync(11000);
    expect(room.localParticipant.listenerCount(ParticipantEvent.LocalTrackPublished)).toBe(before);
    await internals.onLocalTrackPublished(
      new LocalTrackPublication(Track.Kind.Audio, new TrackInfo({ sid: 'unrelated-sid' })),
    );
    expect(subscribed).not.toHaveBeenCalled();
    await plan.cancel();
    await room.dispose();
  });
  it('disconnect settles attachment and releases a reserved sender', async () => {
    const { plan, initial, track, engine, release } = fixture();
    plan.reserve(initial);
    const attached = plan.attachTrack(track);
    engine.isClosed = true;
    plan.disconnected();
    await expect(attached).rejects.toThrow();
    await plan.cancel();
    expect(release).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

function publicationFixture() {
  const room = new Room();
  const participant = room.localParticipant;
  participant.permissions = new ParticipantPermission({ canPublish: true });
  participant.setEnabledPublishCodecs([{ mime: 'video/vp8', fmtpLine: '' }]);
  const capture = Object.assign(new EventTarget(), {
    kind: 'audio',
    id: 'captured-mic',
    label: 'capture',
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => ({ channelCount: 1 }),
    getConstraints: () => ({}),
  }) as unknown as MediaStreamTrack;
  const track = new LocalAudioTrack(capture);
  track.source = Track.Source.Microphone;
  vi.spyOn(track, 'startMonitor').mockImplementation(() => {});
  vi.spyOn(track, 'stop');
  const engine = room.engine;
  const closed = vi.spyOn(engine, 'isClosed', 'get').mockReturnValue(false);
  Object.defineProperty(engine, 'pcManager', { value: { publisher: {} }, writable: true });
  const sender = { replaceTrack: vi.fn(async () => {}) } as unknown as RTCRtpSender;
  const ack = deferred<TrackInfo>();
  const answer = deferred<void>();
  const creating = deferred<RTCRtpSender>();
  vi.spyOn(engine, 'addTrack').mockReturnValue(ack.promise);
  vi.spyOn(engine, 'createSender').mockReturnValue(creating.promise);
  vi.spyOn(engine, 'negotiate').mockResolvedValue(undefined).mockReturnValueOnce(answer.promise);
  vi.spyOn(engine, 'removeTrack').mockReturnValue(true);
  const actualPublish = participant as unknown as {
    publish(
      track: LocalTrack,
      options: {},
      stereo: boolean,
      prepared?: PreparedPublicationState,
    ): Promise<LocalTrackPublication>;
  };
  const plan = new PreparedPublicationState(
    { source: Track.Source.Microphone },
    {},
    [],
    'opus',
    false,
    (attachedTrack, prepared) => actualPublish.publish(attachedTrack, {}, false, prepared),
  );
  plan.skipReservation();
  const close = async () => {
    engine.pcManager = undefined;
    closed.mockRestore();
    await room.dispose();
    track.stop();
  };
  return {
    room,
    participant,
    engine,
    track,
    sender,
    ack,
    answer,
    creating,
    plan,
    actualPublish,
    close,
  };
}

describe('prepared fallback uses transactional ordinary publication', () => {
  it.each(['registration', 'negotiation'])(
    'removes the sender and listeners when cancelled during %s',
    async (phase) => {
      const f = publicationFixture();
      const attaching = f.plan.attachTrack(f.track);
      const rejected = expect(attaching).rejects.toThrow('cancelled');
      await vi.waitFor(() => expect(f.engine.createSender).toHaveBeenCalledOnce());
      f.creating.resolve(f.sender);
      await vi.waitFor(() => expect(f.engine.negotiate).toHaveBeenCalledOnce());
      if (phase === 'registration') f.answer.resolve();
      else f.ack.resolve(new TrackInfo({ sid: 'TR_fallback' }));
      let cancelled = false;
      const cancelling = f.plan.cancel().then(() => {
        cancelled = true;
      });
      await Promise.resolve();
      expect(cancelled).toBe(false);
      f.ack.resolve(new TrackInfo({ sid: 'TR_fallback' }));
      f.answer.resolve();
      await rejected;
      await cancelling;
      expect(f.engine.removeTrack).toHaveBeenCalledWith(f.sender);
      expect(f.track.sender).toBeUndefined();
      expect(f.participant.trackPublications.size).toBe(0);
      expect(f.track.listenerCount(TrackEvent.Muted)).toBe(0);
      expect(f.track.stop).not.toHaveBeenCalled();
      await f.close();
    },
  );
  it('waits for late sender creation before rolling back a rejected registration', async () => {
    const f = publicationFixture();
    const attaching = f.plan.attachTrack(f.track);
    const rejected = expect(attaching).rejects.toThrow('rejected');
    await vi.waitFor(() => expect(f.engine.createSender).toHaveBeenCalledOnce());
    f.ack.reject(new Error('rejected'));
    await Promise.resolve();
    expect(f.engine.removeTrack).not.toHaveBeenCalled();
    f.creating.resolve(f.sender);
    f.answer.resolve();
    await rejected;
    await f.plan.cancel();
    expect(f.engine.removeTrack).toHaveBeenCalledWith(f.sender);
    expect(f.track.sender).toBeUndefined();
    expect(f.participant.trackPublications.size).toBe(0);
    expect(f.track.stop).not.toHaveBeenCalled();
    await f.close();
  });
  it.each([false, true])(
    'installs buffer listeners before subscription replay, prepared: %s',
    async (prepared) => {
      const f = publicationFixture();
      const stopBuffer = vi.spyOn(f.track, 'stopPreConnectBuffer');
      vi.spyOn(f.track, 'getPreConnectBuffer').mockReturnValue(undefined);
      f.participant.on(ParticipantEvent.LocalTrackPublished, (publication) => {
        f.participant.emit(ParticipantEvent.LocalTrackSubscribed, publication);
      });
      const attaching = prepared
        ? f.plan.attachTrack(f.track)
        : f.actualPublish.publish(f.track, {}, false);
      f.creating.resolve(f.sender);
      f.ack.resolve(
        new TrackInfo({
          sid: 'TR_buffer',
          audioFeatures: [AudioTrackFeature.TF_PRECONNECT_BUFFER],
        }),
      );
      f.answer.resolve();
      await attaching;
      expect(stopBuffer).toHaveBeenCalledOnce();
      expect(f.participant.listenerCount(ParticipantEvent.LocalTrackSubscribed)).toBe(0);
      expect(f.participant.listenerCount(ParticipantEvent.LocalTrackUnpublished)).toBe(0);
      expect(f.plan.isCommitted).toBe(prepared);
      await f.plan.cancel();
      expect(f.engine.removeTrack).not.toHaveBeenCalled();
      // The fixture's publication is committed; dispose owns the room, not the plan.
      f.participant.trackPublications.clear();
      await f.close();
    },
  );
});

describe('prepared publication option normalization', () => {
  it.each(['defaults', 'caller'])(
    'snapshots nested %s settings and declared format',
    async (origin) => {
      const encoding = { maxBitrate: 500000 };
      const layers = [new VideoPreset(320, 180, 100000)];
      const room = new Room({
        publishDefaults: {
          videoEncoding: encoding,
          videoSimulcastLayers: layers,
          audioPreset: { maxBitrate: 32000 },
        },
      });
      const format = { width: 1280, height: 720 };
      const plan = bridge(room).prepare({
        source: Track.Source.Camera,
        format,
        publishOptions: {
          simulcast: false,
          backupCodec: false,
          ...(origin === 'caller' ? { videoEncoding: encoding } : {}),
        },
      }) as PreparedPublicationState;
      expect(plan.options.videoSimulcastLayers![0].resolution).toEqual(layers[0].resolution);
      const before = JSON.stringify({
        request: plan.request,
        encodings: plan.encodings,
        options: plan.options,
      });
      encoding.maxBitrate = 1500000;
      layers[0].encoding.maxBitrate = 900000;
      room.options.publishDefaults.audioPreset!.maxBitrate = 96000;
      format.width = 640;
      expect(
        JSON.stringify({ request: plan.request, encodings: plan.encodings, options: plan.options }),
      ).toBe(before);
      expect(plan.specification.format).toEqual({ width: 1280, height: 720 });
      await plan.cancel();
      await room.dispose();
    },
  );
  it('defers H264 with default VP8 backup to ordinary publication without dropping backup policy', async () => {
    const room = new Room();
    const plan = bridge(room).prepare({
      source: Track.Source.Camera,
      format: { width: 640, height: 480 },
      publishOptions: { videoCodec: 'h264', backupCodec: true },
    }) as PreparedPublicationState;
    expect(plan.canReserve).toBe(false);
    expect(plan.options.backupCodec).toEqual({ codec: 'vp8' });
    await plan.cancel();
    await room.dispose();
  });
  it('does not expose preparation methods on the application Room', async () => {
    const room = new Room();
    expect('preparePublication' in room).toBe(false);
    expect(Symbol.for('livekit.internal.sessionPublication.v1') in room).toBe(false);
    await room.dispose();
  });
  it('reserves a microphone in any state until the room is disposed', async () => {
    const room = new Room();
    const plan = room.localParticipant.reservePublication!({
      source: Track.Source.Microphone,
    });
    expect(plan).toBeInstanceOf(PreparedPublicationState);
    expect(plan!.request.muted).toBe(true);
    await room.dispose();
    expect(plan!.isCancelled).toBe(true);
    expect(
      room.localParticipant.reservePublication!({ source: Track.Source.Microphone }),
    ).toBeUndefined();
  });
});
