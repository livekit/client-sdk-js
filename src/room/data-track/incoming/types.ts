import type Participant from '../../participant/Participant';
import type RemoteDataTrack from '../RemoteDataTrack';
import { type DataTrackSid } from '../types';

/** Request sent to the SFU to update the subscription for a data track. */
export type EventSfuUpdateSubscription = {
  /** Identifier of the affected track. */
  sid: DataTrackSid;
  /** Whether to subscribe or unsubscribe. */
  subscribe: boolean;
};

/** A track has been published by a remote participant and is available to be subscribed to. */
export type EventTrackAvailable = {
  track: RemoteDataTrack;
};

/** A track has been unpublished by a remote participant and can no longer be subscribed to. */
export type EventTrackUnavailable = {
  sid: DataTrackSid;
  publisherIdentity: Participant['identity'];
};
