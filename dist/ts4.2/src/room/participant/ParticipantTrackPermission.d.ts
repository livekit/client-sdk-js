import { TrackPermission } from '@livekit/protocol';
export interface ParticipantTrackPermission {
    /**
     * The participant identity this permission applies to.
     * You can either provide this or `participantSid`
     */
    participantIdentity?: string;
    /**
     * The participant server id this permission applies to.
     * You can either provide this or `participantIdentity`
     */
    participantSid?: string;
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
export declare function trackPermissionToProto(perms: ParticipantTrackPermission): TrackPermission;
//# sourceMappingURL=ParticipantTrackPermission.d.ts.map
