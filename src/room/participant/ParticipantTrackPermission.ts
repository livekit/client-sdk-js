/**
 * Copyright 2023 LiveKit, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TrackPermission } from '../../proto/livekit_rtc_pb';

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

export function trackPermissionToProto(perms: ParticipantTrackPermission): TrackPermission {
  if (!perms.participantSid && !perms.participantIdentity) {
    throw new Error(
      'Invalid track permission, must provide at least one of participantIdentity and participantSid',
    );
  }
  return new TrackPermission({
    participantIdentity: perms.participantIdentity ?? '',
    participantSid: perms.participantSid ?? '',
    allTracks: perms.allowAll ?? false,
    trackSids: perms.allowedTrackSids || [],
  });
}
