import type LocalAudioTrack from './LocalAudioTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import type RemoteAudioTrack from './RemoteAudioTrack';
import type RemoteVideoTrack from './RemoteVideoTrack';

export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;
export type AudioTrack = RemoteAudioTrack | LocalAudioTrack;
export type VideoTrack = RemoteVideoTrack | LocalVideoTrack;

export type AdaptiveStreamSettings = boolean | {
  /**
   * Set a custom pixel density, defaults to 1
   * When streaming videos on a ultra high definition screen this setting
   * let's you account for the devicePixelRatio of those screens.
   * Set it to `screen` to use the actual pixel density of the screen
   * Note: this might significantly increase the bandwidth consumed by people
   * streaming on high definition screens.
   */
  pixelDensity?: number | 'screen'
};
