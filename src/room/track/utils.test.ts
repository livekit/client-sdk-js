import {
  AudioCaptureOptions, VideoCaptureOptions, VideoPresets,
} from './options';
import { mergeDefaultOptions } from './utils';

describe('mergeDefaultOptions', () => {
  const audioDefaults: AudioCaptureOptions = {
    autoGainControl: true,
    channelCount: 2,
  };
  const videoDefaults: VideoCaptureOptions = {
    deviceId: 'video123',
    resolution: VideoPresets.fhd.resolution,
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
    const opts = mergeDefaultOptions({
      audio: true,
    }, audioDefaults, videoDefaults);
    expect(opts.audio).toEqual(audioDefaults);
    expect(opts.video).toEqual(undefined);
  });

  it('enables overriding specific fields', () => {
    const opts = mergeDefaultOptions({
      audio: { channelCount: 1 },
    }, audioDefaults, videoDefaults);
    const audioOpts = opts.audio as AudioCaptureOptions;
    expect(audioOpts.channelCount).toEqual(1);
    expect(audioOpts.autoGainControl).toEqual(true);
  });
});
