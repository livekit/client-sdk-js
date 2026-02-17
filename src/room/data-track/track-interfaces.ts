import type { DataTrackInfo } from "./types";

function isObject(subject: unknown): subject is object {
  return subject !== null && typeof subject === 'object';
}

export const LocalTrackSymbol: symbol = Symbol.for("lk.local-track");

/** An interface representing a track (of any type) which is local and sending data to the SFU. */
export interface ILocalTrack {
  readonly localitySymbol: typeof LocalTrackSymbol;

  isPublished(): boolean;
}

export function isLocalTrack(subject: unknown): subject is ILocalTrack {
  return (
    isObject(subject) &&
    'localitySymbol' in subject &&
    subject.localitySymbol === LocalTrackSymbol
  );
}

export const RemoteTrackSymbol: symbol = Symbol.for("lk.remote-track");

/** An interface representing a track (of any type) which is remote and receiving data from the SFU. */
export interface IRemoteTrack {
  readonly localitySymbol: typeof RemoteTrackSymbol;
}

export function isRemoteTrack(subject: unknown): subject is IRemoteTrack {
  return (
    isObject(subject) &&
    'localitySymbol' in subject &&
    subject.localitySymbol === RemoteTrackSymbol
  );
}

export const DataTrackSymbol: symbol = Symbol.for("lk.data-track");
/** An interface representing a data track, either local or remote. */
export interface IDataTrack {
  readonly typeSymbol: typeof DataTrackSymbol;

  readonly info: DataTrackInfo;
}

export function isDataTrack(subject: unknown): subject is IDataTrack {
  return (
    isObject(subject) &&
    'typeSymbol' in subject &&
    subject.typeSymbol === DataTrackSymbol
  );
}
