import { TrackInfo } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type InitialPublicationSender, PreparedPublicationState } from './PreparedPublication';
import { Room } from './Room';
import { EngineEvent, ParticipantEvent } from './events';
import type LocalTrack from './track/LocalTrack';
import LocalTrackPublication from './track/LocalTrackPublication';
import { Track } from './track/Track';

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
  const transport = {};
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
    const plan = room.preparePublication({ source: Track.Source.Microphone });
    expect(createTracks).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    await plan.cancel();
    await room.dispose();
  });
  it('uses the declared audio format over default stereo settings', async () => {
    const room = new Room();
    const plan = room.preparePublication({
      source: Track.Source.Microphone,
      format: { channelCount: 2 },
    }) as PreparedPublicationState;
    expect(plan.request.stereo).toBe(true);
    expect(() =>
      room.preparePublication({
        source: Track.Source.Microphone,
        format: { channelCount: 2 },
        publishOptions: { forceStereo: false },
      }),
    ).toThrow('disagree');
    await plan.cancel();
    await room.dispose();
  });
  it('attaches only after the explicitly claimed connect is ready', async () => {
    const { plan, track, publish, publication, release } = fixture();
    const attached = plan.attachTrack(track);
    plan.connectionReady();
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    plan.claimed = true;
    plan.connectionReady();
    expect(await attached).toBe(publication);
    expect(track.source).toBe(Track.Source.Microphone);
    expect(release).toHaveBeenCalledOnce();
    await plan.cancel();
    expect(publish).toHaveBeenCalledOnce();
  });
  it('rejects cancellation promptly before JOIN settles and never stops caller media', async () => {
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
    plan.claimed = true;
    plan.reserve(initial);
    const cancelled = plan.cancel();
    expect(transceiver.stop).not.toHaveBeenCalled();
    plan.connectionReady();
    await cancelled;
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
      plan.claimed = true;
      if (reason === 'codec')
        initial.accepted = Promise.resolve(new TrackInfo({ codecs: [{ mimeType: 'audio/pcmu' }] }));
      if (reason === 'format') track.getSourceTrackSettings = () => ({ channelCount: 2 });
      plan.reserve(initial);
      plan.connectionReady();
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
    expect(plan.hasInitialSender).toBe(false);
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
      const plan = room.preparePublication({
        source: Track.Source.Microphone,
      }) as PreparedPublicationState;
      plan.claimed = true;
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
      await plan.cancel();
      await room.dispose();
      vi.useRealTimers();
    },
  );
  it('disconnect settles attachment and releases a reserved sender', async () => {
    const { plan, initial, track, engine, release } = fixture();
    plan.claimed = true;
    plan.reserve(initial);
    const attached = plan.attachTrack(track);
    engine.isClosed = true;
    plan.disconnected();
    await expect(attached).rejects.toThrow();
    await plan.cancel();
    expect(release).toHaveBeenCalledOnce();
  });
});
