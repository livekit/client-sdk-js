import log from '../../logger';
import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import CriticalTimers from '../timers';
import {
  FlowControlledDataChannel,
  type FlowControlledDataChannelOptions,
} from './FlowControlledDataChannel';

export interface LossyDataChannelOptions extends FlowControlledDataChannelOptions {
  /**
   * What to do with a send while the buffer is full: `drop` discards it to keep latency bounded
   * (the classic lossy channel), `wait` backpressures the producer until there is headroom (the
   * data-track channel, whose producer decides what to skip at frame granularity).
   */
  bufferFullBehavior: 'drop' | 'wait';
  /** Sends are silently discarded while this is true (a reconnect attempt is underway). */
  shouldSkipSends: () => boolean;
}

/**
 * A lossy channel: flow control plus a per-instance full-buffer policy.
 *
 * Each instance owns its own byterate stat, drop counter, and (when tuning is started) the
 * dynamic `bufferedAmountLowThreshold` adjustment that keeps the drop gate at roughly 100ms of
 * buffered latency. Keeping these per instance is what prevents one channel's traffic from
 * steering another channel's policy.
 */
export class LossyDataChannel extends FlowControlledDataChannel {
  private bufferFullBehavior: 'drop' | 'wait';

  private shouldSkipSends: () => boolean;

  private statCurrentBytes = 0;

  private statByterate = 0;

  private statInterval: ReturnType<typeof setInterval> | undefined;

  private dropCount = 0;

  constructor(opts: LossyDataChannelOptions) {
    super(opts);
    this.bufferFullBehavior = opts.bufferFullBehavior;
    this.shouldSkipSends = opts.shouldSkipSends;
  }

  /** Sends prepared bytes with this channel's full-buffer policy (drop or wait). */
  async send(msg: NonSharedUint8Array) {
    const dc = this.getChannel();
    if (!dc) {
      return;
    }
    // Depending on the channel's policy, either drop or wait for the buffer to drain below the
    // high-water mark before continuing.
    switch (this.bufferFullBehavior) {
      case 'wait':
        if (!this.isBelowHighWaterMark(dc)) {
          await this.waitForHeadroomWithLock();
        }
        break;
      case 'drop':
        // We check against the actual threshold on the DC here, as it is tuned dynamically.
        if (!this.isBelowLowWaterMark(dc)) {
          // Drop messages to reduce latency
          this.dropCount += 1;
          if (this.dropCount % 100 === 0) {
            log.warn(`dropping lossy data channel messages, total dropped: ${this.dropCount}`);
          }
          return;
        }
    }
    this.statCurrentBytes += msg.byteLength;

    if (this.shouldSkipSends()) {
      return;
    }

    try {
      dc.send(msg);
      this.refreshBufferStatus();
    } catch (error: unknown) {
      // Preserve prior surface behaviour: a send that fails because the channel is closing is
      // logged, not thrown, so lossy/data-track sends don't reject during teardown windows.
      if (error instanceof TypeError) {
        log.error(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Starts the once-per-second adjustment of the channel's `bufferedAmountLowThreshold` to the
   * observed byterate, keeping the drop gate at roughly 100ms of buffered latency (clamped to
   * the watermarks). Restarts cleanly if already running.
   */
  startThresholdTuning() {
    this.stopThresholdTuning();
    this.statInterval = CriticalTimers.setInterval(() => {
      this.statByterate = this.statCurrentBytes;
      this.statCurrentBytes = 0;

      const dc = this.getChannel();
      if (dc) {
        // control buffered latency to ~100ms
        const threshold = this.statByterate / 10;
        dc.bufferedAmountLowThreshold = Math.min(
          Math.max(threshold, this.lowWaterMark),
          this.highWaterMark,
        );
      }
    }, 1000);
  }

  /** Stops the threshold tuning and resets the stats and drop counter. */
  stopThresholdTuning() {
    this.statByterate = 0;
    this.statCurrentBytes = 0;
    if (this.statInterval) {
      CriticalTimers.clearInterval(this.statInterval);
      this.statInterval = undefined;
    }
    this.dropCount = 0;
  }
}
