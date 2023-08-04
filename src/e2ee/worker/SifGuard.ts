import { MAX_SIF_COUNT, MAX_SIF_DURATION } from '../constants';

export class SifGuard {
  private consecutiveSifCount = 0;

  private sifSequenceStartedAt: number | undefined;

  private lastSifReceivedAt: number = 0;

  private userFramesSinceSif: number = 0;

  recordSif() {
    this.consecutiveSifCount += 1;
    this.sifSequenceStartedAt ??= Date.now();
    this.lastSifReceivedAt = Date.now();
  }

  recordUserFrame() {
    if (this.sifSequenceStartedAt === undefined) {
      return;
    } else {
      this.userFramesSinceSif += 1;
    }
    if (
      // reset if we received more user frames than SIFs
      this.userFramesSinceSif > this.consecutiveSifCount ||
      // also reset if we got a new user frame and the latest SIF frame hasn't been updated in a while
      Date.now() - this.lastSifReceivedAt > MAX_SIF_DURATION
    ) {
      this.reset();
    }
  }

  isSifAllowed() {
    return (
      this.consecutiveSifCount < MAX_SIF_COUNT &&
      (this.sifSequenceStartedAt === undefined ||
        Date.now() - this.sifSequenceStartedAt < MAX_SIF_DURATION)
    );
  }

  reset() {
    this.userFramesSinceSif = 0;
    this.consecutiveSifCount = 0;
    this.sifSequenceStartedAt = undefined;
  }
}
