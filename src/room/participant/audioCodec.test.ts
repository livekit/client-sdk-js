import {
  AudioTrackFeature,
  JoinResponse,
  ParticipantInfo,
  ParticipantPermission,
  TrackInfo,
} from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignalConnectionState } from '../../api/SignalClient';
import { CoreRoom } from '../CoreRoom';
import type { PCTransportManager } from '../PCTransportManager';
import { TrackEvent } from '../events';
import LocalAudioTrack from '../track/LocalAudioTrack';
import { Track } from '../track/Track';
import type { TrackPublishOptions } from '../track/options';
import { Future } from '../utils';

class Microphone extends EventTarget {
  readonly kind = 'audio';

  readonly id = 'mic';

  enabled = true;

  stop = vi.fn();

  getSettings = () => ({ channelCount: 2 });

  getConstraints = () => ({});
}

function setup(publishDefaults?: TrackPublishOptions) {
  const codecs = [{ mimeType: 'audio/PCMA' }, { mimeType: 'audio/PCMU' }];
  const setCodecPreferences = vi.fn();
  vi.stubGlobal('MediaStreamTrack', Microphone);
  vi.stubGlobal('RTCPeerConnection', { prototype: { addTransceiver: vi.fn() } });
  vi.stubGlobal('RTCRtpTransceiver', { prototype: { setCodecPreferences } });
  vi.stubGlobal('RTCRtpSender', { getCapabilities: () => ({ codecs }) });

  const participant = new CoreRoom({ publishDefaults }).localParticipant;
  const engine = participant.engine;
  engine.latestJoinResponse = new JoinResponse({
    enabledPublishCodecs: codecs.map((codec) => ({ mime: codec.mimeType })),
  });
  participant.updateInfo(
    new ParticipantInfo({ permission: new ParticipantPermission({ canPublish: true }) }),
  );
  vi.spyOn(engine, 'isClosed', 'get').mockReturnValue(false);
  vi.spyOn(engine.client, 'currentState', 'get').mockReturnValue(SignalConnectionState.CONNECTED);

  const mic = new Microphone();
  const track = mic as unknown as MediaStreamTrack;
  const sender = {
    track: track as MediaStreamTrack | null,
    async replaceTrack(next: MediaStreamTrack | null) {
      this.track = next;
    },
  };
  const transceiver = { sender, setCodecPreferences, direction: 'sendonly' };
  const addPublisherTransceiver = vi.fn(
    (_track: MediaStreamTrack, _init: RTCRtpTransceiverInit) => transceiver,
  );
  const removeTrack = vi.fn();
  engine.pcManager = {
    addPublisherTransceiver,
    removeTrack,
    publisher: { getTransceivers: () => [transceiver] },
  } as unknown as PCTransportManager;
  const addTrack = vi.spyOn(engine, 'addTrack').mockImplementation(
    async (req) =>
      new TrackInfo({
        sid: 'TR_mic',
        stereo: req.stereo,
        codecs: req.simulcastCodecs.map((c) => ({ mimeType: `audio/${c.codec}`, cid: c.cid })),
      }),
  );
  const negotiate = vi.spyOn(engine, 'negotiate').mockResolvedValue();
  return {
    participant,
    engine,
    mic,
    track,
    sender,
    transceiver,
    setCodecPreferences,
    addPublisherTransceiver,
    addTrack,
    removeTrack,
    negotiate,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('audio codec publication', () => {
  it.each([
    { codec: 'pcma', options: undefined },
    { codec: 'pcmu', options: { audioCodec: { codec: 'pcmu' } } },
  ] as const)(
    'publishes $codec with a codec-specific request and transceiver',
    async ({ codec, options }) => {
      const {
        participant,
        track,
        setCodecPreferences,
        addPublisherTransceiver,
        addTrack,
        negotiate,
      } = setup({ audioCodec: 'pcma' });

      const publication = await participant.publishTrack(track, options);

      expect(setCodecPreferences).toHaveBeenCalledExactlyOnceWith([
        { mimeType: `audio/${codec.toUpperCase()}` },
      ]);
      expect(addTrack).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          disableDtx: true,
          disableRed: true,
          stereo: false,
          audioFeatures: [AudioTrackFeature.TF_NO_DTX],
          simulcastCodecs: [expect.objectContaining({ codec, cid: track.id })],
        }),
      );
      expect(setCodecPreferences.mock.invocationCallOrder[0]).toBeLessThan(
        addTrack.mock.invocationCallOrder[0],
      );
      expect(addTrack.mock.invocationCallOrder[0]).toBeLessThan(
        negotiate.mock.invocationCallOrder[0],
      );
      expect(
        addPublisherTransceiver.mock.calls[0][1].sendEncodings?.[0].maxBitrate,
      ).toBeUndefined();
      expect(publication.options?.audioCodec).toEqual(options?.audioCodec ?? 'pcma');
      expect(publication.getTrackFeatures()).toEqual([AudioTrackFeature.TF_NO_DTX]);
      publication.track?.stop();
    },
  );

  it.each(['opus', 'red'] as const)('uses the existing %s settings', async (codec) => {
    const { participant, track, setCodecPreferences, addPublisherTransceiver, addTrack } = setup({
      audioCodec: 'pcmu',
    });

    const publication = await participant.publishTrack(track, {
      audioCodec: { codec, dtx: false, stereo: true, maxBitrate: 96000 },
    });

    expect(addTrack).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        disableDtx: true,
        disableRed: codec === 'opus',
        stereo: true,
        simulcastCodecs: [],
      }),
    );
    expect(addPublisherTransceiver.mock.calls[0][1].sendEncodings?.[0].maxBitrate).toBe(96000);
    expect(setCodecPreferences).not.toHaveBeenCalled();
    publication.track?.stop();
  });

  it('uses normal negotiation when audioCodec is omitted', async () => {
    const { participant, track, setCodecPreferences, addTrack } = setup();
    vi.stubGlobal('RTCRtpSender', undefined);

    const publication = await participant.publishTrack(track);

    expect(addTrack).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ disableDtx: false, disableRed: false, simulcastCodecs: [] }),
    );
    expect(setCodecPreferences).not.toHaveBeenCalled();
    publication.track?.stop();
  });

  it.each(['browser', 'server'])(
    'rejects G.711 unavailable on the %s before creating a sender',
    async (source) => {
      const { participant, engine, track, addTrack, addPublisherTransceiver } = setup();
      if (source === 'browser') {
        vi.stubGlobal('RTCRtpSender', undefined);
      } else {
        engine.latestJoinResponse = new JoinResponse();
      }

      await expect(participant.publishTrack(track, { audioCodec: 'pcma' })).rejects.toMatchObject({
        name: 'PublishTrackError',
        status: 415,
        message: expect.stringContaining(source),
      });
      expect(addTrack).not.toHaveBeenCalled();
      expect(addPublisherTransceiver).not.toHaveBeenCalled();
    },
  );

  it('unpublishes G.711 screen audio that ends before the publish confirmation', async () => {
    const { participant, mic, track, addTrack } = setup();
    const requestSent = new Future<void, Error>();
    const confirmation = new Future<TrackInfo, Error>();
    addTrack.mockImplementationOnce(() => {
      requestSent.resolve();
      return confirmation.promise;
    });

    const publishing = participant.publishTrack(track, {
      audioCodec: 'pcma',
      source: Track.Source.ScreenShareAudio,
    });
    await requestSent.promise;
    mic.dispatchEvent(new Event('ended'));
    confirmation.resolve(new TrackInfo({ sid: 'TR_mic', codecs: [{ mimeType: 'audio/pcma' }] }));

    const publication = await publishing;
    publication.track?.stop();
    expect(participant.trackPublications.size).toBe(0);
  });

  it('detaches the Ended listener when the engine closes before creating a sender', async () => {
    const { participant, engine, track, addPublisherTransceiver } = setup();
    const localTrack = new LocalAudioTrack(track);
    vi.spyOn(engine, 'isClosed', 'get').mockReturnValue(true);

    await expect(participant.publishTrack(localTrack, { audioCodec: 'pcma' })).rejects.toThrow(
      'cannot publish track when not connected',
    );
    expect(localTrack.listenerCount(TrackEvent.Ended)).toBe(0);
    expect(addPublisherTransceiver).not.toHaveBeenCalled();
  });

  it('removes the unpublished sender if the server chooses another codec', async () => {
    const { participant, mic, track, sender, addTrack, removeTrack, negotiate } = setup();
    const localTrack = new LocalAudioTrack(track);
    addTrack.mockImplementationOnce(async () => {
      mic.dispatchEvent(new Event('ended'));
      return new TrackInfo({ codecs: [{ mimeType: 'audio/opus' }] });
    });

    await expect(
      participant.publishTrack(localTrack, {
        audioCodec: 'pcma',
        source: Track.Source.ScreenShareAudio,
      }),
    ).rejects.toMatchObject({
      name: 'PublishTrackError',
      status: 415,
      message: 'server did not accept audio codec pcma',
    });
    expect(removeTrack).toHaveBeenCalledExactlyOnceWith(sender, false);
    expect(negotiate).toHaveBeenCalledOnce();
    expect(removeTrack.mock.invocationCallOrder[0]).toBeLessThan(
      negotiate.mock.invocationCallOrder[0],
    );
    expect(participant.trackPublications.size).toBe(0);
    expect(localTrack.listenerCount(TrackEvent.Ended)).toBe(0);
    expect(mic.stop).not.toHaveBeenCalled();
  });

  it('deactivates a paused G.711 sender if publication fails', async () => {
    const { participant, track, addTrack, sender, transceiver, removeTrack } = setup();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/156.0.0.0');
    const localTrack = new LocalAudioTrack(track);
    addTrack.mockImplementationOnce(async () => {
      await localTrack.pauseUpstream();
      return new TrackInfo({ codecs: [{ mimeType: 'audio/opus' }] });
    });

    await expect(
      participant.publishTrack(localTrack, { audioCodec: 'pcma' }),
    ).rejects.toMatchObject({
      status: 415,
    });
    expect(sender.track).toBeNull();
    expect(transceiver.direction).toBe('inactive');
    expect(removeTrack).toHaveBeenCalledExactlyOnceWith(sender, false);
  });

  it('signals a G.711 track muted while publication is pending', async () => {
    const { participant, engine, track, addTrack } = setup();
    const localTrack = new LocalAudioTrack(track);
    const updateMuteStatus = vi.spyOn(engine, 'updateMuteStatus').mockImplementation(() => {});
    addTrack.mockImplementationOnce(async () => {
      await localTrack.mute();
      return new TrackInfo({ sid: 'TR_mic', codecs: [{ mimeType: 'audio/pcma' }] });
    });

    await participant.publishTrack(localTrack, { audioCodec: 'pcma' });

    expect(updateMuteStatus).toHaveBeenCalledExactlyOnceWith('TR_mic', true);
    localTrack.stop();
  });
});
