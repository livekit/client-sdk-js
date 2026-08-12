import { Mutex } from '@livekit/mutex';
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
 * {@link invalidateWaiters}, which aborts parked waiters (releasing the gate); the next waiter
 * gets a fresh controller.
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

  /** Cancels parked headroom waiters when the handle is replaced or torn down. */
  private waiterAbortController = new AbortController();

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
   * parked waiters — their events would never fire again on the abandoned object — and installs a
   * fresh controller, so queued senders re-check against the new channel. Wrappers outlive their
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
   * this is true and block once it goes false. Callers resolve the handle (and decide what an
   * absent one means) before asking.
   */
  isBelowHighWaterMark(dc: RTCDataChannel): boolean {
    // RTCDataChannel has no built-in high-water mark, so we compare against our static mark.
    return dc.bufferedAmount <= this.highWaterMark;
  }

  /**
   * Whether the send buffer has drained to its low-water mark. Drives the engine's public
   * DCBufferStatusChanged event.
   */
  isBelowLowWaterMark(dc: RTCDataChannel): boolean {
    // Read the channel's own threshold: it is tuned dynamically for the lossy channel.
    return dc.bufferedAmount <= dc.bufferedAmountLowThreshold;
  }

  /**
   * Acquires the headroom lock, resolving with the unlock function. Batch senders (the resume
   * replay) hold it across all of their sends so no other sender can interleave, calling
   * {@link waitForHeadroomWithoutLock} per message to respect flow control within the batch.
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
  async waitForHeadroomWithLock() {
    const unlock = await this.lockHeadroom();
    try {
      await this.waitForHeadroomWithoutLock();
    } finally {
      unlock();
    }
  }

  /** Core wait of {@link waitForHeadroomWithLock}. The caller must hold the headroom lock. */
  async waitForHeadroomWithoutLock() {
    if (this.isEngineClosed()) {
      throw new UnexpectedConnectionState('engine closed');
    }
    const dc = this.getChannel();
    if (!dc) {
      throw new UnexpectedConnectionState(`DataChannel not found, kind: ${this.kind}`);
    }
    if (this.isBelowHighWaterMark(dc)) {
      return;
    }
    const abortSignal = this.waiterAbortController.signal;
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
      const onAbort = () => {
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
        abortSignal.removeEventListener('abort', onAbort);
      };
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      dc.addEventListener('bufferedamountlow', onBufferedAmountLow);
      // Proxy along any error caused by the data channel closing while we wait.
      dc.addEventListener('close', onDCClose);
      // The channel object we're parked on can be abandoned without ever firing another event
      // (e.g. the engine recreating channels); the abort is our way out.
      abortSignal.addEventListener('abort', onAbort);
    });
  }

  /** Rejects all parked headroom waiters; the next waiter gets a fresh controller. */
  invalidateWaiters(reason: string) {
    this.waiterAbortController.abort(reason);
    this.waiterAbortController = new AbortController();
  }

  /**
   * Recomputes whether the buffer has drained to the low-water mark and, if that changed since the
   * last check, notifies the status listener. Two independent triggers land here: a send (which
   * raises the buffer) and the `bufferedamountlow` drain event (which lowers it) — the latter has
   * no send to hang the work off, which is why this is a shared entry point rather than a tail of
   * `send`.
   */
  refreshBufferStatus() {
    const dc = this.getChannel();
    if (!dc) {
      return;
    }
    const isLow = this.isBelowLowWaterMark(dc);
    if (isLow !== this.bufferStatusLow) {
      this.bufferStatusLow = isLow;
      this.onBufferStatusChanged?.(isLow);
    }
  }
}
