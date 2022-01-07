import { TrackPermission } from '../../proto/livekit_rtc';

export interface ParticipantTrackPermission {
  /**
   * The participant id this permission applies to.
   */
  participantSid: string;

  /**
   * The list of track ids that the target participant can subscribe to.
   * When unset, it'll allow all tracks to be subscribed by the participant.
   * When empty, this participant is disallowed from subscribing to any tracks.
   */
  allowedTrackSids?: string[];
}

export function trackPermissionToProto(perms: ParticipantTrackPermission): TrackPermission {
  return {
    participantSid: perms.participantSid,
    allTracks: perms.allowedTrackSids === undefined,
    trackSids: perms.allowedTrackSids || [],
  };
}
