import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mutex } from '@livekit/mutex';
import LocalVideoTrack, { videoLayersFromEncodings } from './LocalVideoTrack';
import type { SimulcastTrackInfo } from './LocalVideoTrack';
import { Track, VideoQuality } from './Track';
import type { VideoCodec } from './options';

describe('videoLayersFromEncodings', () => {
  it('returns single layer for no encoding', () => {
    const layers = videoLayersFromEncodings(640, 360);
    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].width).toBe(640);
    expect(layers[0].height).toBe(360);
  });

  it('returns single layer for explicit encoding', () => {
    const layers = videoLayersFromEncodings(640, 360, [
      {
        maxBitrate: 200_000,
      },
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].bitrate).toBe(200_000);
  });

  it('returns three layers for simulcast', () => {
    const layers = videoLayersFromEncodings(1280, 720, [
      {
        scaleResolutionDownBy: 4,
        rid: 'q',
        maxBitrate: 125_000,
      },
      {
        scaleResolutionDownBy: 2,
        rid: 'h',
        maxBitrate: 500_000,
      },
      {
        rid: 'f',
        maxBitrate: 1_200_000,
      },
    ]);

    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].width).toBe(320);
    expect(layers[2].quality).toBe(VideoQuality.HIGH);
    expect(layers[2].height).toBe(720);
  });

  it('returns qualities starting from lowest for SVC', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L2T2',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(2);
    expect(layers[0].quality).toBe(VideoQuality.MEDIUM);
    expect(layers[0].width).toBe(1280);
    expect(layers[1].quality).toBe(VideoQuality.LOW);
    expect(layers[1].width).toBe(640);
  });

  it('returns qualities starting from lowest for SVC (three layers)', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L3T3',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].width).toBe(1280);
    expect(layers[1].quality).toBe(VideoQuality.MEDIUM);
    expect(layers[1].width).toBe(640);
    expect(layers[2].quality).toBe(VideoQuality.LOW);
    expect(layers[2].width).toBe(320);
  });

  it('returns qualities starting from lowest for SVC (single layer)', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L1T2',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].width).toBe(1280);
  });

  it('handles portrait', () => {
    const layers = videoLayersFromEncodings(720, 1280, [
      {
        scaleResolutionDownBy: 4,
        rid: 'q',
        maxBitrate: 125_000,
      },
      {
        scaleResolutionDownBy: 2,
        rid: 'h',
        maxBitrate: 500_000,
      },
      {
        rid: 'f',
        maxBitrate: 1_200_000,
      },
    ]);
    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].height).toBe(320);
    expect(layers[2].quality).toBe(VideoQuality.HIGH);
    expect(layers[2].width).toBe(720);
  });
});

function makeSender(label = 'sender', events: string[] = []) {
  let params: RTCRtpSendParameters = {
    encodings: [],
    transactionId: '',
    codecs: [],
    headerExtensions: [],
    rtcp: {},
  };
  return {
    getParameters: () => params,
    // resolves on a later task, like the real setParameters, so that a caller
    // which fails to await it never observes the update
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      events.push(`${label}:start`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      params = next;
      events.push(`${label}:done`);
    }),
    get degradationPreference() {
      return params.degradationPreference;
    },
  };
}

function makeTrack() {
  const track = Object.create(LocalVideoTrack.prototype) as LocalVideoTrack;
  Object.assign(track, {
    log: { debug: vi.fn(), warn: vi.fn() },
    simulcastCodecs: new Map<VideoCodec, SimulcastTrackInfo>(),
    subscribedCodecs: undefined,
  });
  // logContext and mediaStreamTrack are getters we don't set up state for here
  Object.defineProperty(track, 'logContext', { get: () => ({}) });
  Object.defineProperty(track, 'mediaStreamTrack', { get: () => ({ clone: () => ({}) }) });
  return track;
}

describe('setDegradationPreference', () => {
  it('applies the preference to the primary sender', async () => {
    const track = makeTrack();
    const sender = makeSender();
    Object.assign(track, { _sender: sender });

    await track.setDegradationPreference('maintain-resolution');

    expect(sender.degradationPreference).toBe('maintain-resolution');
  });

  it('applies the resolved preference to a backup codec sender', async () => {
    const track = makeTrack();
    const primary = makeSender();
    Object.assign(track, { _sender: primary });

    await track.setDegradationPreference('maintain-resolution');

    // the backup codec transceiver is created later, when the server asks for it
    const backupInfo = track.addSimulcastTrack('vp8', [])!;
    const backup = makeSender();
    await track.setSimulcastTrackSender('vp8', backup as unknown as RTCRtpSender);

    expect(backupInfo.sender).toBe(backup);
    expect(backup.degradationPreference).toBe('maintain-resolution');
    expect(primary.degradationPreference).toBe('maintain-resolution');
  });

  it('updates every sender when the preference changes after the backup is published', async () => {
    const track = makeTrack();
    const primary = makeSender();
    Object.assign(track, { _sender: primary });
    await track.setDegradationPreference('maintain-framerate');

    track.addSimulcastTrack('vp8', []);
    const backup = makeSender();
    await track.setSimulcastTrackSender('vp8', backup as unknown as RTCRtpSender);

    await track.setDegradationPreference('balanced');

    expect(primary.degradationPreference).toBe('balanced');
    expect(backup.degradationPreference).toBe('balanced');
  });

  it('applies to senders one at a time', async () => {
    const events: string[] = [];
    const track = makeTrack();
    const primary = makeSender('primary', events);
    Object.assign(track, { _sender: primary });
    track.addSimulcastTrack('vp8', []);
    await track.setSimulcastTrackSender(
      'vp8',
      makeSender('backup', events) as unknown as RTCRtpSender,
    );
    events.length = 0;

    await track.setDegradationPreference('balanced');

    // setParameters is only valid against the most recent getParameters, so the
    // writes must not overlap
    expect(events).toEqual(['primary:start', 'primary:done', 'backup:start', 'backup:done']);
  });
});

describe('backup codec tracks', () => {
  // happy-dom's user agent reads as an old Safari, which refuses pauseUpstream
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  type FakeTrack = MediaStreamTrack & { clones: FakeTrack[] };

  function makeMediaStreamTrack(id: string): FakeTrack {
    const track = {
      id,
      kind: 'video',
      enabled: true,
      muted: false,
      readyState: 'live',
      clones: [] as FakeTrack[],
      clone: () => {
        const clone = makeMediaStreamTrack(`${id}-clone${track.clones.length}`);
        track.clones.push(clone);
        return clone;
      },
      stop: () => {
        track.readyState = 'ended';
      },
      getConstraints: () => ({}),
      getSettings: () => ({}),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return track as unknown as FakeTrack;
  }

  function makeTrackSender() {
    const sender = {
      track: null as MediaStreamTrack | null,
      replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => {
        sender.track = track;
      }),
    };
    return sender;
  }

  async function publishWithBackupCodec(source: MediaStreamTrack, userProvidedTrack = true) {
    const track = new LocalVideoTrack(source, undefined, userProvidedTrack);
    // the constructor sets the track up under this lock, wait for it like a real publish would
    const { trackChangeLock } = track as unknown as { trackChangeLock: Mutex };
    (await trackChangeLock.lock())();
    const primary = makeTrackSender();
    // bypass the sender setter, which would apply the degradation preference
    Object.assign(track, { _sender: primary });
    await primary.replaceTrack(track.mediaStreamTrack);

    const info = track.addSimulcastTrack('vp8', [])!;
    const backup = makeTrackSender();
    info.sender = backup as unknown as RTCRtpSender;
    await backup.replaceTrack(info.mediaStreamTrack);
    return { track, info, backup };
  }

  it('sends a clone of the replacement track on the backup codec and stops the old clone', async () => {
    const camera = makeMediaStreamTrack('camera');
    const { track, info, backup } = await publishWithBackupCodec(camera);
    const oldClone = info.mediaStreamTrack;
    expect(backup.track).toBe(oldClone);

    // turning a user provided camera off and on again
    await track.pauseUpstream();
    expect(backup.track).toBeNull();
    camera.stop();
    const newCamera = makeMediaStreamTrack('new-camera');
    await track.replaceTrack(newCamera);

    expect(track.mediaStreamTrack).toBe(newCamera);
    expect(info.mediaStreamTrack).toBe(newCamera.clones[0]);
    expect(backup.track).toBe(newCamera.clones[0]);
    expect(oldClone.readyState).toBe('ended');

    // resuming after another pause sends the current clone, not the first one
    await track.pauseUpstream();
    await track.resumeUpstream();
    expect(backup.track).toBe(newCamera.clones[0]);
  });

  it('stops the backup codec clone when an SDK managed camera is muted', async () => {
    const camera = makeMediaStreamTrack('camera');
    const { track, info } = await publishWithBackupCodec(camera, false);
    Object.defineProperty(track, 'source', { get: () => Track.Source.Camera });

    await track.mute();

    // the clone shares the capture device, so leaving it live keeps the camera on
    expect(camera.readyState).toBe('ended');
    expect(info.mediaStreamTrack.readyState).toBe('ended');
  });
});
