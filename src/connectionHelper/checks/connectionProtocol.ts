import { type CheckInfo, Checker } from './Checker';

export interface ProtocolStats {
  protocol: 'udp' | 'tcp';
  packetsLost: number;
  packetsSent: number;
  qualityLimitationDurations: Record<string, number>;
  // total metrics measure sum of all measurements, along with a count
  rttTotal: number;
  jitterTotal: number;
  bitrateTotal: number;
  count: number;
}

export class ConnectionProtocolCheck extends Checker {
  private bestStats?: ProtocolStats;

  get description(): string {
    return 'Connection via UDP vs TCP';
  }

  async perform(): Promise<void> {
    const udpStats = await this.checkConnectionProtocol('udp');
    const tcpStats = await this.checkConnectionProtocol('tcp');
    this.bestStats = udpStats;
    // udp should is the better protocol typically. however, we'd prefer TCP when either of these conditions are true:
    // 1. the bandwidth limitation is worse on UDP by 500ms (10% of the test duration)
    // 2. the packet loss is higher on UDP by 1%
    if (
      udpStats.qualityLimitationDurations.bandwidth -
        tcpStats.qualityLimitationDurations.bandwidth >
        0.5 ||
      (udpStats.packetsLost - tcpStats.packetsLost) / udpStats.packetsSent > 0.01
    ) {
      this.appendMessage('best connection quality via TCP');
      this.bestStats = tcpStats;
    } else {
      this.appendMessage('best connection quality via UDP');
    }

    this.appendMessage(
      `upstream bitrate: ${(this.bestStats.bitrateTotal / this.bestStats.count / 1000 / 1000).toFixed(2)} mbps`,
    );
    this.appendMessage(
      `RTT: ${((this.bestStats.rttTotal / this.bestStats.count) * 1000).toFixed(2)} ms`,
    );
    this.appendMessage(
      `jitter: ${((this.bestStats.jitterTotal / this.bestStats.count) * 1000).toFixed(2)} ms`,
    );

    if (this.bestStats.packetsLost > 0) {
      this.appendMessage(
        `packets lost: ${((this.bestStats.packetsLost / this.bestStats.packetsSent) * 100).toFixed(2)}%`,
      );
    }
    if (this.bestStats.qualityLimitationDurations.bandwidth > 0) {
      this.appendWarning(
        `bandwidth limited ${((this.bestStats.qualityLimitationDurations.bandwidth / 5) * 100).toFixed(2)}%`,
      );
    }
    if (this.bestStats.qualityLimitationDurations.cpu > 0) {
      this.appendWarning(
        `cpu limited ${((this.bestStats.qualityLimitationDurations.cpu / 5) * 100).toFixed(2)}%`,
      );
    }
  }

  getInfo(): CheckInfo {
    const info = super.getInfo();
    info.data = this.bestStats;
    return info;
  }

  private async checkConnectionProtocol(protocol: 'tcp' | 'udp'): Promise<ProtocolStats> {
    this.appendMessage(`connecting via ${protocol}`);
    await this.connect();
    if (protocol === 'tcp') {
      await this.switchProtocol('tcp');
    }

    // create a canvas with animated content
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    let hue = 0;
    const animate = () => {
      hue = (hue + 1) % 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      requestAnimationFrame(animate);
    };
    animate();

    // create video track from canvas
    const stream = canvas.captureStream(30); // 30fps
    const videoTrack = stream.getVideoTracks()[0];

    // publish to room
    const pub = await this.room.localParticipant.publishTrack(videoTrack, {
      simulcast: false,
    });
    const track = pub.track!;

    const protocolStats: ProtocolStats = {
      protocol,
      packetsLost: 0,
      packetsSent: 0,
      qualityLimitationDurations: {},
      rttTotal: 0,
      jitterTotal: 0,
      bitrateTotal: 0,
      count: 0,
    };
    // gather stats once a second
    const interval = setInterval(async () => {
      const stats = await track.getRTCStatsReport();
      stats?.forEach((stat) => {
        if (stat.type === 'outbound-rtp') {
          protocolStats.packetsSent = stat.packetsSent;
          protocolStats.qualityLimitationDurations = stat.qualityLimitationDurations;
          protocolStats.bitrateTotal += stat.targetBitrate;

          protocolStats.count++;
        } else if (stat.type === 'remote-inbound-rtp') {
          protocolStats.packetsLost = stat.packetsLost;
          protocolStats.rttTotal += stat.roundTripTime;
          protocolStats.jitterTotal += stat.jitter;
        }
      });
    }, 1000);

    // wait a bit to gather stats
    await new Promise((resolve) => setTimeout(resolve, 5000));
    clearInterval(interval);

    videoTrack.stop();
    await this.disconnect();
    return protocolStats;
  }
}
