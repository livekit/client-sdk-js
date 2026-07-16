import { Mutex } from '@livekit/mutex';
import type { Throws } from '@livekit/throws-transformer/throws';
import TypedPromise from '../../utils/TypedPromise';
import { UnexpectedConnectionState } from '../errors';
import type { DataChannelKind } from './types';

export interface FlowControlledDataChannelOptions {
  kind: DataChannelKind;
  /** Buffer level (bytes) at which blocked senders resume; armed as `bufferedAmountLowThreshold`. */
  lowWaterMark: number;
  /** Buffer level (bytes) above which senders block until the buffer drains to the low mark. */
  highWaterMark: number;
  /** Whether the owning engine has been closed — a closed engine rejects waiters immediately. */
  isEngineClosed: () => boolean;
  /**
   * Notified when the buffer crosses the low-water mark in either direction (debounced: fires only
   * on an actual change). Drives the engine's public DCBufferStatusChanged event.
   */
  onBufferStatusChanged?: (isLow: boolean) => void;
}

/**
 * Two-watermark flow control for one data channel kind.
 *
 * Owns the per-kind headroom gate: senders proceed freely while the buffer is at or below the
 * high-water mark and otherwise block — serialized FIFO through a mutex — until the browser's
 * `bufferedamountlow` event (armed at the low-water mark) signals the buffer has drained. The
 * serialization prevents woken senders from all refilling at once and overflowing the SCTP send
 * buffer (see livekit/client-sdk-js#1995).
 *
 * Waiters are parked on the channel object captured at wait entry. If that object stops being
 * current — replaced or torn down — its events may never fire again, so the owner must call
 * {@link invalidateWaiters}, which rejects parked waiters (releasing the gate) and starts a
 * fresh epoch.
 */
export class FlowControlledDataChannel {
  readonly kind: DataChannelKind;

  readonly lowWaterMark: number;

  readonly highWaterMark: number;

  protected isEngineClosed: () => boolean;

  private onBufferStatusChanged?: (isLow: boolean) => void;

  /** Last emitted low-water status; starts true (an empty buffer is below the mark). */
  private bufferStatusLow = true;

  private handle?: RTCDataChannel;

  private headroomLock = new Mutex();

  private epoch = new AbortController();

  constructor(opts: FlowControlledDataChannelOptions) {
    this.kind = opts.kind;
    this.lowWaterMark = opts.lowWaterMark;
    this.highWaterMark = opts.highWaterMark;
    this.isEngineClosed = opts.isEngineClosed;
    this.onBufferStatusChanged = opts.onBufferStatusChanged;
  }

  /** The currently attached RTCDataChannel handle, if any. */
  get channelHandle(): RTCDataChannel | undefined {
    return this.handle;
  }

  /**
   * Attaches the channel handle this wrapper controls. Replacing an existing handle rejects
   * parked waiters — their events would never fire again on the abandoned object — and starts a
   * fresh epoch, so queued senders re-check against the new channel. Wrappers outlive their
   * handles: this is the one place handle turnover happens, which is what makes stranding a
   * waiter structurally impossible.
   */
  attach(dc: RTCDataChannel) {
    if (this.handle && this.handle !== dc) {
      this.invalidateWaiters('data channel replaced');
    }
    this.handle = dc;
  }

  /** Detaches the handle on teardown, rejecting parked waiters. */
  detach(reason: string = 'data channel torn down') {
    if (this.handle) {
      this.invalidateWaiters(reason);
    }
    this.handle = undefined;
  }

  protected getChannel(): RTCDataChannel | undefined {
    return this.handle;
  }

  /**
   * Whether the send buffer has room to accept more data (the send gate). Senders proceed while
   * this is true and block once it goes false.
   */
  isBelowHighWaterMark(): Throws<boolean, TypeError> {
    const dc = this.getChannel();
    if (!dc) {
      throw new TypeError(`Could not get data channel for kind ${this.kind}`);
    }
    // RTCDataChannel has no built-in high-water mark, so we compare against our static mark.
    return dc.bufferedAmount <= this.highWaterMark;
  }

  /**
   * Whether the send buffer has drained to its low-water mark. Drives the engine's public
   * DCBufferStatusChanged event.
   */
  isBelowLowWaterMark(): Throws<boolean, TypeError> {
    const dc = this.getChannel();
    if (!dc) {
      throw new TypeError(`Could not get data channel for kind ${this.kind}`);
    }
    // Read the channel's own threshold: it is tuned dynamically for the lossy channel.
    return dc.bufferedAmount <= dc.bufferedAmountLowThreshold;
  }

  /**
   * Acquires the headroom lock, resolving with the unlock function. Batch senders (the resume
   * replay) hold it across all of their sends so no other sender can interleave, calling
   * {@link waitForHeadroomLocked} per message to respect flow control within the batch.
   */
  lockHeadroom(): Promise<() => void> {
    return this.headroomLock.lock();
  }

  /**
   * Resolves once the caller may send on this channel: immediately while the send buffer is at or
   * below its high-water mark, otherwise once the buffer has drained to the low-water mark (the
   * `bufferedamountlow` event). Callers are serialized through the headroom lock so that, when
   * the buffer drains, they refill it one at a time (up to the high-water mark) rather than all
   * sending at once and overflowing the SCTP send buffer (see livekit/client-sdk-js#1995). The
   * closed/buffer checks run inside the lock so queued callers proceed in FIFO order.
   */
  async waitForHeadroom() {
    const unlock = await this.lockHeadroom();
    try {
      await this.waitForHeadroomLocked();
    } finally {
      unlock();
    }
  }

  /** Core wait of {@link waitForHeadroom}. The caller must hold the headroom lock. */
  async waitForHeadroomLocked() {
    if (this.isEngineClosed()) {
      throw new UnexpectedConnectionState('engine closed');
    }
    if (this.isBelowHighWaterMark()) {
      return;
    }
    const dc = this.getChannel();
    if (!dc) {
      throw new UnexpectedConnectionState(`DataChannel not found, kind: ${this.kind}`);
    }
    const epochSignal = this.epoch.signal;
    await new TypedPromise<void, UnexpectedConnectionState>((resolve, reject) => {
      const onBufferedAmountLow = () => {
        cleanup();
        resolve();
      };
      const onDCClose = () => {
        cleanup();
        reject(
          new UnexpectedConnectionState(
            `DataChannel ${this.kind} closed while draining the buffer`,
          ),
        );
      };
      const onEpochAbort = () => {
        cleanup();
        reject(
          new UnexpectedConnectionState(
            `DataChannel ${this.kind} was replaced or torn down while waiting for headroom`,
          ),
        );
      };
      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', onBufferedAmountLow);
        dc.removeEventListener('close', onDCClose);
        epochSignal.removeEventListener('abort', onEpochAbort);
      };
      if (epochSignal.aborted) {
        onEpochAbort();
        return;
      }
      dc.addEventListener('bufferedamountlow', onBufferedAmountLow);
      // Proxy along any error caused by the data channel closing while we wait.
      dc.addEventListener('close', onDCClose);
      // The channel object we're parked on can be abandoned without ever firing another event
      // (e.g. the engine recreating channels); the epoch abort is our way out.
      epochSignal.addEventListener('abort', onEpochAbort);
    });
  }

  /** Rejects all parked headroom waiters and starts a fresh epoch. */
  invalidateWaiters(reason: string) {
    this.epoch.abort(reason);
    this.epoch = new AbortController();
  }

  /**
   * Recomputes whether the buffer has drained to the low-water mark and, if that changed since the
   * last check, notifies the status listener. Two independent triggers land here: a send (which
   * raises the buffer) and the `bufferedamountlow` drain event (which lowers it) — the latter has
   * no send to hang the work off, which is why this is a shared entry point rather than a tail of
   * `send`.
   */
  refreshBufferStatus() {
    if (!this.getChannel()) {
      return;
    }
    const isLow = this.isBelowLowWaterMark();
    if (isLow !== this.bufferStatusLow) {
      this.bufferStatusLow = isLow;
      this.onBufferStatusChanged?.(isLow);
    }
  }
}
