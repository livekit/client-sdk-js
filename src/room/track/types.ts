import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalDataTrack } from './LocalDataTrack';
import { LocalVideoTrack } from './LocalVideoTrack';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteDataTrack } from './RemoteDataTrack';
import { RemoteVideoTrack } from './RemoteVideoTrack';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack | LocalDataTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack | RemoteDataTrack;
