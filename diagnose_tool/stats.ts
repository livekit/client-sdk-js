import { VideoSenderStats } from '../src/room/stats';
import { SubscribedVideoTrackStats } from './utils';

export interface CandidatePair {
  availableOutgoingBitrate: number;
  availableIncomingBitrate: number;
  currentRoundTripTime: number;
  localCandidateId: string;
  remoteCandidateId: string;
  state: string;
}

export interface Candidate {
  id?: string;
  protocol?: string;
  candidateType?: string;
}

export interface TestStats {
  // connection stats
  selectedLocalCandidate?: Candidate;
  candidatePair: CandidatePair;
  senderStats?: VideoSenderStats;
  receiverStats?: SubscribedVideoTrackStats;
}

export interface TestItem {
  name: string;
  expect?: string;
  actual: string;
  pass?: boolean;
}

export interface ExpectStats {
  bitrates: number;
  fps: number;
}

export class TestSummary {
  stats: TestStats[] = [];

  isReceiver?: boolean;

  expect: ExpectStats;

  constructor(expect: ExpectStats, isReceiver?: boolean) {
    this.expect = expect;
    this.isReceiver = isReceiver;
  }

  pushStats(stats: TestStats) {
    this.stats.push(stats);
  }

  summary(durationSec: number): TestItem[] {
    const items: TestItem[] = [];
    if (this.stats.length == 0) {
      return items;
    }
    const actual = {
      protocol: '',
      candidateType: '',
      rtt: 0,
      availableBitrates: 0,

      // bytes: number,
      frameWidth: 0,
      frameHeight: 0,
      qualitiLimitaionDurations: {},
      qualityLimitationResolutionChanges: 0,
      fps: 0,
      bitrates: 0,
    };

    this.stats.forEach((stats) => {
      actual.rtt += stats.candidatePair.currentRoundTripTime * 1000;
      if (stats.selectedLocalCandidate) {
        actual.protocol = stats.selectedLocalCandidate.protocol!;
        actual.candidateType = stats.selectedLocalCandidate.candidateType!;
      }
      if (this.isReceiver) {
        actual.availableBitrates += stats.candidatePair.availableIncomingBitrate;
        actual.frameWidth += stats.receiverStats!.frameWidth!;
        actual.frameHeight += stats.receiverStats!.frameHeight!;
        actual.fps = stats.receiverStats!.framesReceived!;
        actual.bitrates = stats.receiverStats!.bytesReceived! * 8;
      } else {
        actual.availableBitrates += stats.candidatePair.availableOutgoingBitrate;
        actual.frameWidth += stats.senderStats!.frameWidth!;
        actual.frameHeight += stats.senderStats!.frameHeight!;
        actual.fps = stats.senderStats!.framesSent;
        actual.bitrates = stats.senderStats!.bytesSent! * 8;
        actual.qualityLimitationResolutionChanges =
          stats.senderStats!.qualityLimitationResolutionChanges!;
        actual.qualitiLimitaionDurations = stats.senderStats!.qualityLimitationDurations!;
      }
    });

    // calculates frames/bytes between [head, end]
    if (this.stats.length > 1) {
      const stats = this.stats[0];
      actual.fps -= this.isReceiver
        ? stats.receiverStats!.framesReceived!
        : stats.senderStats!.framesSent!;
      actual.bitrates -= this.isReceiver
        ? stats.receiverStats!.bytesReceived! * 8
        : stats.senderStats!.bytesSent! * 8;
    }

    const count = this.stats.length;
    actual.rtt /= count;
    actual.availableBitrates /= count;
    actual.fps /= durationSec;
    actual.bitrates /= durationSec;
    actual.frameWidth /= count;
    actual.frameHeight /= count;

    items.push(
      {
        name: 'candidate',
        actual: `${actual.protocol} / ${actual.candidateType}`,
      },
      {
        name: 'rtt(ms)',
        actual: actual.rtt.toFixed(0).toString(),
      },
      {
        name: 'bandwidth(bps)',
        actual: actual.availableBitrates.toFixed(0).toString(),
        // expect: this.expect.availableBitrates.toString(),
        // pass: availableBitrates / this.expect.availableBitrates >= 1,
      },
      {
        name: 'fps',
        actual: actual.fps.toFixed(0).toString(),
        expect: this.expect.fps.toString(),
        pass: actual.fps / this.expect.fps > 0.9,
      },
      {
        name: 'average resolution',
        actual: `${actual.frameWidth.toFixed(0).toString()} x ${actual.frameHeight
          .toFixed(0)
          .toString()}`,
      },
      {
        name: 'bitrates(bps)',
        actual: actual.bitrates.toFixed(0).toString(),
        expect: this.expect.bitrates.toString(),
        pass: actual.bitrates / this.expect.bitrates > 0.95,
      },
    );

    if (!this.isReceiver) {
      items.push({
        name: 'quality limitations',
        actual: `events: ${actual.qualityLimitationResolutionChanges}, duration: ${JSON.stringify(
          actual.qualitiLimitaionDurations,
        )}`,
        expect: 'none',
        pass:
          actual.qualityLimitationResolutionChanges < 3 &&
          //@ts-ignore
          actual.qualitiLimitaionDurations.none / durationSec > 0.95,
      });
    }

    return items;
  }
}
