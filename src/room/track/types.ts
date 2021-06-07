import LocalAudioTrack from './LocalAudioTrack';
import LocalVideoTrack from './LocalVideoTrack';
import RemoteAudioTrack from './RemoteAudioTrack';
import RemoteVideoTrack from './RemoteVideoTrack';

export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;
export type AudioTrack = RemoteAudioTrack | LocalAudioTrack;
export type VideoTrack = RemoteVideoTrack | LocalVideoTrack;
