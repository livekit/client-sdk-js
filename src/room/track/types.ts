import { TrackInfo, TrackType } from '../../proto/model';
import { TrackInvalidError } from '../errors';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalAudioTrackPublication } from './LocalAudioTrackPublication';
import { LocalDataTrack } from './LocalDataTrack';
import { LocalDataTrackPublication } from './LocalDataTrackPublication';
import { LocalVideoTrack } from './LocalVideoTrack';
import { LocalVideoTrackPublication } from './LocalVideoTrackPublication';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteAudioTrackPublication } from './RemoteAudioTrackPublication';
import { RemoteDataTrack } from './RemoteDataTrack';
import { RemoteDataTrackPublication } from './RemoteDataTrackPublication';
import { RemoteTrackPublication } from './RemoteTrackPublication';
import { RemoteVideoTrack } from './RemoteVideoTrack';
import { RemoteVideoTrackPublication } from './RemoteVideoTrackPublication';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack | LocalDataTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack | RemoteDataTrack;

export type AudioTrackPublication =
  | LocalAudioTrackPublication
  | RemoteAudioTrackPublication;
export type VideoTrackPublication =
  | LocalVideoTrackPublication
  | RemoteVideoTrackPublication;
export type DataTrackPublication =
  | LocalDataTrackPublication
  | RemoteDataTrackPublication;

/** @internal */
export function createRemoteTrackPublicationFromInfo(
  info: TrackInfo
): RemoteTrackPublication {
  let tp: RemoteTrackPublication;
  switch (info.type) {
    case TrackType.AUDIO:
      tp = new RemoteAudioTrackPublication(info);
      break;
    case TrackType.VIDEO:
      tp = new RemoteVideoTrackPublication(info);
      break;
    case TrackType.DATA:
      tp = new RemoteDataTrackPublication(info);
      break;
    default:
      throw new TrackInvalidError('unsupported trackinfo type');
  }

  return tp;
}
