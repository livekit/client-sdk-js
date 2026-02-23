import type { DataTrackInfo } from './types';

function isObject(subject: unknown): subject is object {
  return subject !== null && typeof subject === 'object';
}

export const TrackSymbol: symbol = Symbol.for('lk.track');

export interface ITrack {
  readonly trackSymbol: typeof TrackSymbol;
}

function isTrack(subject: unknown): subject is ITrack {
  return isObject(subject) && 'trackSymbol' in subject && subject.trackSymbol === TrackSymbol;
}

/** An interface representing a track (of any type) which is local and sending data to the SFU. */
export interface ILocalTrack extends ITrack {
  readonly isLocal: true;

  isPublished(): boolean;
}

// @ts-ignore - Export this in the future when cutting over to new track interfaces more widely
function isLocalTrack(subject: unknown): subject is ILocalTrack {
  return isTrack(subject) && 'isLocal' in subject && subject.isLocal === true;
}

export const RemoteTrackSymbol: symbol = Symbol.for('lk.remote-track');

/** An interface representing a track (of any type) which is remote and receiving data from the SFU. */
export interface IRemoteTrack extends ITrack {
  readonly isLocal: false;
}

// @ts-ignore - Export this in the future when cutting over to new track interfaces more widely
function isRemoteTrack(subject: unknown): subject is IRemoteTrack {
  return (
    isTrack(subject) && 'localitySymbol' in subject && subject.localitySymbol === RemoteTrackSymbol
  );
}

export const DataTrackSymbol: symbol = Symbol.for('lk.data-track');
/** An interface representing a data track, either local or remote. */
export interface IDataTrack extends ITrack {
  readonly typeSymbol: typeof DataTrackSymbol;

  readonly info: DataTrackInfo;
}

export function isDataTrack(subject: unknown): subject is IDataTrack {
  return isTrack(subject) && 'typeSymbol' in subject && subject.typeSymbol === DataTrackSymbol;
}
