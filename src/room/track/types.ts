import type LocalAudioTrack from './LocalAudioTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import type RemoteAudioTrack from './RemoteAudioTrack';
import type RemoteVideoTrack from './RemoteVideoTrack';

export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;
export type AudioTrack = RemoteAudioTrack | LocalAudioTrack;
export type VideoTrack = RemoteVideoTrack | LocalVideoTrack;
