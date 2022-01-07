import { TrackPermission } from '../../proto/livekit_rtc';

export interface ParticipantTrackPermission {
  /**
   * The participant id this permission applies to.
   */
  participantSid: string;

  /**
   * Grant permission to all all tracks. Takes precedence over allowedTrackSids.
   * false if unset.
   */
  allowAll?: boolean;

  /**
   * The list of track ids that the target participant can subscribe to.
   * When unset, it'll allow all tracks to be subscribed by the participant.
   * When empty, this participant is disallowed from subscribing to any tracks.
   */
  allowedTrackSids?: string[];
}

export function trackPermissionToProto(perms: ParticipantTrackPermission): TrackPermission {
  if (!perms.participantSid) {
    throw new Error('Invalid track permission, missing participantSid');
  }
  return {
    participantSid: perms.participantSid,
    allTracks: perms.allowAll ?? false,
    trackSids: perms.allowedTrackSids || [],
  };
}
