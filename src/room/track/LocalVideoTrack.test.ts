import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mutex } from '@livekit/mutex';
import LocalVideoTrack, { videoLayersFromEncodings } from './LocalVideoTrack';
import type { SimulcastTrackInfo } from './LocalVideoTrack';
import { Track, VideoQuality } from './Track';
import type { VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';

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

  // the backup sender rejects the first swap to a clone of the track `id`
  function rejectFirstSwapTo(backup: ReturnType<typeof makeTrackSender>, id: string) {
    let rejected = false;
    backup.replaceTrack.mockImplementation(async (next: MediaStreamTrack | null) => {
      if (!rejected && next?.id.startsWith(id)) {
        rejected = true;
        throw new Error('rejected');
      }
      backup.track = next;
    });
  }

  // lets queued work, such as a retry waiting for the track change lock, run
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  // a processor whose init() waits until the test rejects it
  function makeFailingProcessor() {
    let rejectInit: (error: Error) => void = () => {};
    const processor = {
      name: 'failing',
      init: () =>
        new Promise<void>((_, reject) => {
          rejectInit = reject;
        }),
      restart: async () => {},
      destroy: async () => {},
    } as TrackProcessor<Track.Kind.Video>;
    return { processor, rejectInit: (error: Error) => rejectInit(error) };
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

  it('stops the backup codec when its sender rejects the new track, and retries it with the same track', async () => {
    const cameraA = makeMediaStreamTrack('camera');
    const { track, info, backup } = await publishWithBackupCodec(cameraA);
    const cloneA = info.mediaStreamTrack;
    rejectFirstSwapTo(backup, 'camera-b');

    // 1. replacing A with B fails on the backup sender
    const cameraB = makeMediaStreamTrack('camera-b');
    await expect(track.replaceTrack(cameraB)).rejects.toThrow('rejected');

    // 2. the backup sender stops sending, 3. and A's clone is stopped: the application replaced A
    expect(backup.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(backup.track).toBeNull();
    expect(cloneA.readyState).toBe('ended');
    expect(cameraB.clones[0].readyState).toBe('ended');

    // 4. retrying with the same track sends a fresh clone of it
    await track.replaceTrack(cameraB);
    expect(cameraB.clones).toHaveLength(2);
    expect(backup.track).toBe(cameraB.clones[1]);
    expect(info.mediaStreamTrack).toBe(cameraB.clones[1]);
    expect(cameraB.clones[1].readyState).toBe('live');
  });

  it('retries a backup codec whose sender rejected the track when upstream resumes', async () => {
    const { track, info, backup } = await publishWithBackupCodec(makeMediaStreamTrack('camera'));
    rejectFirstSwapTo(backup, 'camera-b');
    const cameraB = makeMediaStreamTrack('camera-b');
    await expect(track.replaceTrack(cameraB)).rejects.toThrow('rejected');

    await track.pauseUpstream();
    await track.resumeUpstream();

    // a fresh clone of B, not the clone stopped when the swap failed
    expect(cameraB.clones).toHaveLength(2);
    expect(backup.track).toBe(cameraB.clones[1]);
    expect(info.mediaStreamTrack).toBe(cameraB.clones[1]);
    expect(cameraB.clones[1].readyState).toBe('live');
  });

  it('clones a replacement track once for a backup codec whose sender rejected the previous one', async () => {
    const { track, backup } = await publishWithBackupCodec(makeMediaStreamTrack('camera'));
    rejectFirstSwapTo(backup, 'camera-b');
    await expect(track.replaceTrack(makeMediaStreamTrack('camera-b'))).rejects.toThrow('rejected');

    const cameraC = makeMediaStreamTrack('camera-c');
    await track.replaceTrack(cameraC);
    await flush();

    // the track change refreshes every backup codec, so resuming upstream on the way must not
    // swap the rejected one, neither before nor after
    expect(cameraC.clones).toHaveLength(1);
    expect(backup.track).toBe(cameraC.clones[0]);
    expect(cameraC.clones[0].readyState).toBe('live');
  });

  it('retries a rejected backup codec after a track change that fails before refreshing it', async () => {
    const { track, info, backup } = await publishWithBackupCodec(makeMediaStreamTrack('camera'));
    rejectFirstSwapTo(backup, 'camera-b');
    const cameraB = makeMediaStreamTrack('camera-b');
    await expect(track.replaceTrack(cameraB)).rejects.toThrow('rejected');
    await track.pauseUpstream();

    // resuming while setProcessor() holds the track change lock, then the processor fails
    const { processor, rejectInit } = makeFailingProcessor();
    const setup = track.setProcessor(processor);
    await flush();
    await track.resumeUpstream();
    rejectInit(new Error('init failed'));
    await expect(setup).rejects.toThrow('init failed');
    await flush();

    expect(cameraB.clones).toHaveLength(2);
    expect(backup.track).toBe(cameraB.clones[1]);
    expect(info.mediaStreamTrack).toBe(cameraB.clones[1]);
    expect(cameraB.clones[1].readyState).toBe('live');
  });

  it('keeps a newer backup codec track when an older swap is rejected after it', async () => {
    const { track, info, backup } = await publishWithBackupCodec(makeMediaStreamTrack('camera'));
    let rejectRetry: ((error: Error) => void) | undefined;
    backup.replaceTrack.mockImplementation(async (next: MediaStreamTrack | null) => {
      if (next?.id === 'camera-b-clone0') {
        throw new Error('rejected');
      }
      if (next?.id === 'camera-b-clone1' && !rejectRetry) {
        // the retry's swap is still pending when the next camera comes in, then fails
        return new Promise<void>((_, reject) => {
          rejectRetry = reject;
        });
      }
      backup.track = next;
    });
    await expect(track.replaceTrack(makeMediaStreamTrack('camera-b'))).rejects.toThrow('rejected');

    // a retry is queued behind a failing track change, and starts its swap
    const { processor, rejectInit } = makeFailingProcessor();
    const setup = track.setProcessor(processor);
    await flush();
    await track.resumeUpstream();
    rejectInit(new Error('init failed'));
    await expect(setup).rejects.toThrow('init failed');
    await flush();
    expect(rejectRetry).toBeDefined();

    const cameraC = makeMediaStreamTrack('camera-c');
    await track.replaceTrack(cameraC);
    rejectRetry!(new Error('rejected'));
    await flush();

    // the failed retry must not take the newer camera off the backup codec
    expect(backup.track).toBe(cameraC.clones[0]);
    expect(info.mediaStreamTrack).toBe(cameraC.clones[0]);
    expect(cameraC.clones[0].readyState).toBe('live');
    expect(info.needsRefresh).toBe(false);
  });

  it('drops a pending backup codec retry when the track is stopped first', async () => {
    const { track, backup } = await publishWithBackupCodec(makeMediaStreamTrack('camera'));
    rejectFirstSwapTo(backup, 'camera-b');
    const cameraB = makeMediaStreamTrack('camera-b');
    await expect(track.replaceTrack(cameraB)).rejects.toThrow('rejected');

    const { processor, rejectInit } = makeFailingProcessor();
    const setup = track.setProcessor(processor);
    await flush();
    await track.resumeUpstream();
    track.stop();
    rejectInit(new Error('init failed'));
    await expect(setup).rejects.toThrow('init failed');
    await flush();

    // a retry now would open the capture again through a new clone
    expect(cameraB.clones).toHaveLength(1);
    expect(backup.track).toBeNull();
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
