import { ParticipantInfo, ParticipantPermission, TrackInfo } from '@livekit/protocol';
import { afterEach, expect, it, vi } from 'vitest';
import { SignalConnectionState } from '../../api/SignalClient';
import { CoreRoom } from '../CoreRoom';
import type { PCTransportManager } from '../PCTransportManager';
import type { AudioCodec, TrackPublishOptions } from '../track/options';

class Microphone extends EventTarget {
  readonly kind = 'audio';

  readonly id = 'mic';

  enabled = true;

  stop = vi.fn();

  getSettings = () => ({});

  getConstraints = () => ({});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each<{
  name: string;
  publishDefaults?: TrackPublishOptions;
  options?: TrackPublishOptions;
  codec?: AudioCodec;
}>([
  { name: 'room default', publishDefaults: { audioCodec: 'pcma' }, codec: 'pcma' },
  {
    name: 'per-track override',
    publishDefaults: { audioCodec: 'pcma' },
    options: { audioCodec: { codec: 'pcmu' } },
    codec: 'pcmu',
  },
  { name: 'explicit Opus', options: { audioCodec: 'opus' }, codec: 'opus' },
  { name: 'explicit RED', options: { audioCodec: 'red' }, codec: 'red' },
  { name: 'default negotiation' },
])('sends the expected AddTrack codec for $name', async ({ publishDefaults, options, codec }) => {
  vi.stubGlobal('MediaStreamTrack', Microphone);

  const participant = new CoreRoom({ publishDefaults }).localParticipant;
  const engine = participant.engine;
  participant.updateInfo(
    new ParticipantInfo({ permission: new ParticipantPermission({ canPublish: true }) }),
  );
  vi.spyOn(engine, 'isClosed', 'get').mockReturnValue(false);
  vi.spyOn(engine.client, 'currentState', 'get').mockReturnValue(SignalConnectionState.CONNECTED);

  const track = new Microphone() as unknown as MediaStreamTrack;
  engine.pcManager = { publisher: { getTransceivers: () => [] } } as unknown as PCTransportManager;
  vi.spyOn(engine, 'createSender').mockResolvedValue({ track } as RTCRtpSender);
  vi.spyOn(engine, 'negotiate').mockResolvedValue();
  // The SFU may choose a different codec from the one requested.
  const addTrack = vi
    .spyOn(engine, 'addTrack')
    .mockResolvedValue(new TrackInfo({ sid: 'TR_mic', codecs: [{ mimeType: 'audio/opus' }] }));

  const publication = await participant.publishTrack(track, options);
  publication.track?.stop();

  const simulcastCodecs = codec ? [expect.objectContaining({ codec, cid: track.id })] : [];
  expect(addTrack).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ simulcastCodecs }));
});
