import { AudioTrack } from './AudioTrack';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalVideoTrack } from './LocalVideoTrack';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteVideoTrack } from './RemoteVideoTrack';
import { VideoTrack } from './VideoTrack';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;
export type MediaTrack = AudioTrack | VideoTrack;
