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

import { createLocalAudioTrack } from '../../room/track/create';
import { Checker } from './Checker';

export class PublishAudioCheck extends Checker {
  get description(): string {
    return 'Can publish audio';
  }

  async perform(): Promise<void> {
    const room = await this.connect();

    const track = await createLocalAudioTrack();
    room.localParticipant.publishTrack(track);
    // wait for a few seconds to publish
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // verify RTC stats that it's publishing
    const stats = await track.sender?.getStats();
    if (!stats) {
      throw new Error('Could not get RTCStats');
    }
    let numPackets = 0;
    stats.forEach((stat) => {
      if (stat.type === 'outbound-rtp' && stat.mediaType === 'audio') {
        numPackets = stat.packetsSent;
      }
    });
    if (numPackets === 0) {
      throw new Error('Could not determine packets are sent');
    }
    this.appendMessage(`published ${numPackets} audio packets`);
  }
}
