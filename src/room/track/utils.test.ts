import { AudioCaptureOptions, VideoCaptureOptions, VideoPresets } from './options';
import { constraintsForOptions, facingModeFromDeviceLabel, mergeDefaultOptions } from './utils';

describe('mergeDefaultOptions', () => {
  const audioDefaults: AudioCaptureOptions = {
    autoGainControl: true,
    channelCount: 2,
  };
  const videoDefaults: VideoCaptureOptions = {
    deviceId: 'video123',
    resolution: VideoPresets.h1080.resolution,
  };

  it('does not enable undefined options', () => {
    const opts = mergeDefaultOptions(undefined, audioDefaults, videoDefaults);
    expect(opts.audio).toEqual(undefined);
    expect(opts.video).toEqual(undefined);
  });

  it('does not enable explicitly disabled', () => {
    const opts = mergeDefaultOptions({
      video: false,
    });
    expect(opts.audio).toEqual(undefined);
    expect(opts.video).toEqual(false);
  });

  it('accepts true for options', () => {
    const opts = mergeDefaultOptions(
      {
        audio: true,
      },
      audioDefaults,
      videoDefaults,
    );
    expect(opts.audio).toEqual(audioDefaults);
    expect(opts.video).toEqual(undefined);
  });

  it('enables overriding specific fields', () => {
    const opts = mergeDefaultOptions(
      {
        audio: { channelCount: 1 },
      },
      audioDefaults,
      videoDefaults,
    );
    const audioOpts = opts.audio as AudioCaptureOptions;
    expect(audioOpts.channelCount).toEqual(1);
    expect(audioOpts.autoGainControl).toEqual(true);
  });

  it('does not override explicit false', () => {
    const opts = mergeDefaultOptions(
      {
        audio: { autoGainControl: false },
      },
      audioDefaults,
      videoDefaults,
    );
    const audioOpts = opts.audio as AudioCaptureOptions;
    expect(audioOpts.autoGainControl).toEqual(false);
  });
});

describe('constraintsForOptions', () => {
  it('correctly enables audio bool', () => {
    const constraints = constraintsForOptions({
      audio: true,
    });
    expect(constraints.audio).toEqual(true);
    expect(constraints.video).toEqual(false);
  });

  it('converts audio options correctly', () => {
    const constraints = constraintsForOptions({
      audio: {
        noiseSuppression: true,
        echoCancellation: false,
      },
    });
    const audioOpts = constraints.audio as MediaTrackConstraints;
    expect(Object.keys(audioOpts)).toEqual(['noiseSuppression', 'echoCancellation']);
    expect(audioOpts.noiseSuppression).toEqual(true);
    expect(audioOpts.echoCancellation).toEqual(false);
  });

  it('converts video options correctly', () => {
    const constraints = constraintsForOptions({
      video: {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user',
        deviceId: 'video123',
      },
    });
    const videoOpts = constraints.video as MediaTrackConstraints;
    expect(Object.keys(videoOpts)).toEqual([
      'width',
      'height',
      'frameRate',
      'aspectRatio',
      'facingMode',
      'deviceId',
    ]);
    expect(videoOpts.width).toEqual(VideoPresets.h720.resolution.width);
    expect(videoOpts.height).toEqual(VideoPresets.h720.resolution.height);
    expect(videoOpts.frameRate).toEqual(VideoPresets.h720.resolution.frameRate);
    expect(videoOpts.aspectRatio).toEqual(VideoPresets.h720.resolution.aspectRatio);
  });
});

describe('Test facingMode detection', () => {
  test('OBS virtual camera should be detected.', () => {
    const result = facingModeFromDeviceLabel('OBS Virtual Camera');
    expect(result?.facingMode).toEqual('environment');
    expect(result?.confidence).toEqual('medium');
  });

  test.each([
    ['Peter’s iPhone Camera', { facingMode: 'environment', confidence: 'medium' }],
    ['iPhone de Théo Camera', { facingMode: 'environment', confidence: 'medium' }],
  ])(
    'Device labels that contain "iphone" should return facingMode "environment".',
    (label, expected) => {
      const result = facingModeFromDeviceLabel(label);
      expect(result?.facingMode).toEqual(expected.facingMode);
      expect(result?.confidence).toEqual(expected.confidence);
    },
  );

  test.each([
    ['Peter’s iPad Camera', { facingMode: 'environment', confidence: 'medium' }],
    ['iPad de Théo Camera', { facingMode: 'environment', confidence: 'medium' }],
  ])('Device label that contain "ipad" should detect.', (label, expected) => {
    const result = facingModeFromDeviceLabel(label);
    expect(result?.facingMode).toEqual(expected.facingMode);
    expect(result?.confidence).toEqual(expected.confidence);
  });
});
