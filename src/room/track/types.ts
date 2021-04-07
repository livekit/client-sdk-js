import { AudioTrack } from './AudioTrack';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalDataTrack } from './LocalDataTrack';
import { LocalVideoTrack } from './LocalVideoTrack';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteDataTrack } from './RemoteDataTrack';
import { RemoteVideoTrack } from './RemoteVideoTrack';
import { VideoTrack } from './VideoTrack';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack | LocalDataTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack | RemoteDataTrack;
export type MediaTrack = AudioTrack | VideoTrack;
