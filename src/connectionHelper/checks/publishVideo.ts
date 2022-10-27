import { createLocalVideoTrack } from '../../room/track/create';
import { Checker } from './Checker';

export class PublishVideoCheck extends Checker {
  get description(): string {
    return 'Can publish video';
  }

  async perform(): Promise<void> {
    const room = await this.connect();

    const track = await createLocalVideoTrack();
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
      if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
        numPackets = stat.packetsSent;
      }
    });
    if (numPackets === 0) {
      throw new Error('Could not determine packets are sent');
    }
    this.appendMessage(`published ${numPackets} video packets`);
  }
}
