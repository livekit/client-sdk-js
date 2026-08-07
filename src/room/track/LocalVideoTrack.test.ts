import { describe, expect, it, vi } from 'vitest';
import LocalVideoTrack, { videoLayersFromEncodings } from './LocalVideoTrack';
import type { SimulcastTrackInfo } from './LocalVideoTrack';
import { VideoQuality } from './Track';
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

function makeSender() {
  let params: RTCRtpSendParameters = {
    encodings: [],
    transactionId: '',
    codecs: [],
    headerExtensions: [],
    rtcp: {},
  };
  return {
    getParameters: () => params,
    setParameters: vi.fn((next: RTCRtpSendParameters) => {
      params = next;
      return Promise.resolve();
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
    track.setSimulcastTrackSender('vp8', backup as unknown as RTCRtpSender);

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
    track.setSimulcastTrackSender('vp8', backup as unknown as RTCRtpSender);

    await track.setDegradationPreference('balanced');

    expect(primary.degradationPreference).toBe('balanced');
    expect(backup.degradationPreference).toBe('balanced');
  });
});
