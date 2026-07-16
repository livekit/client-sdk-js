import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import { DataPacketBuffer } from '../../utils/dataPacketBuffer';
import {
  FlowControlledDataChannel,
  type FlowControlledDataChannelOptions,
} from './FlowControlledDataChannel';

export interface ReliableDataChannelOptions extends FlowControlledDataChannelOptions {
  /**
   * Whether sends should currently be deferred to the resume replay instead of hitting the wire
   * (i.e. a reconnect attempt is underway). Read at send time so the reliable channel matches the
   * engine's reconnect state without owning it.
   */
  isDeferringSends: () => boolean;
}

/**
 * The reliable channel: flow control plus delivery-across-resume semantics.
 *
 * Every packet gets a monotonic sequence (stamped into the protobuf by the caller before
 * serialization, via {@link nextSequence}) and is retained in a replay buffer until the channel's
 * `bufferedAmount` confirms it has been handed to the transport. Sends that land in a reconnect
 * window — or whose headroom wait is torn down transiently — are queued unsent and resolve;
 * {@link replay} delivers them (plus any unacked packets) after a resume. Only an engine close
 * rejects, because no replay is coming after that.
 */
export class ReliableDataChannel extends FlowControlledDataChannel {
  private messageBuffer = new DataPacketBuffer();

  private sequence = 1;

  private isDeferringSends: () => boolean;

  constructor(opts: ReliableDataChannelOptions) {
    super(opts);
    this.isDeferringSends = opts.isDeferringSends;
  }

  /**
   * Claims the next packet sequence. The caller stamps it into the packet before serialization,
   * then passes it back to {@link send} so the replay buffer stays keyed by wire sequence.
   */
  nextSequence(): number {
    const sequence = this.sequence;
    this.sequence += 1;
    return sequence;
  }

  /**
   * Sends prepared bytes with reliable semantics. Resolves once the packet has either been handed
   * to the channel or queued for the resume replay; throws only when the engine is closed.
   */
  async send(msg: NonSharedUint8Array, sequence: number) {
    if (this.isDeferringSends()) {
      // A reconnect is already underway — queue for the resume replay instead of parking on a
      // channel that is being torn down. The send resolves; delivery is deferred to the replay.
      this.messageBuffer.push({ data: msg, sequence, sent: false });
      return;
    }

    const dc = this.getChannel();
    if (!dc) {
      return;
    }

    try {
      await this.waitForHeadroom();
    } catch (error) {
      if (this.isEngineClosed()) {
        // No replay is coming after an engine close — surface the failure.
        throw error;
      }
      // Transient teardown (the channel closed or was replaced while we waited): the reliable
      // channel promises delivery across resume, so queue the packet for the replay instead of
      // rejecting a send the app can't meaningfully retry.
      this.messageBuffer.push({ data: msg, sequence, sent: false });
      return;
    }

    if (this.isDeferringSends()) {
      // A reconnect began while we waited for headroom — same deal as above.
      this.messageBuffer.push({ data: msg, sequence, sent: false });
      return;
    }

    this.messageBuffer.push({ data: msg, sequence, sent: true });
    dc.send(msg);
  }

  /**
   * Replays the buffered backlog after a resume: drops everything the server acked
   * (`lastMessageSeq`), then re-sends the rest in order. The headroom lock is held across the
   * whole replay — releasing it between messages would let a concurrent send (whose newer
   * sequence was already assigned before it queued on the lock) hit the wire mid-replay, and
   * receivers would then discard the remaining lower-sequence resent messages as duplicates.
   */
  async replay(lastMessageSeq: number) {
    const dc = this.getChannel();
    if (!dc) {
      return;
    }
    this.messageBuffer.popToSequence(lastMessageSeq);
    const unlock = await this.lockHeadroom();
    try {
      for (const msg of this.messageBuffer.getAll()) {
        // Respect flow control on resume too, so a large resend doesn't overflow the send buffer.
        await this.waitForHeadroomLocked();
        dc.send(msg.data);
      }
      // Everything queued (including packets buffered unsent during the reconnect window) has
      // been handed to the channel. If the loop throws instead, entries keep their unsent flag
      // and the next replay picks them up — receivers dedupe any that did make it out.
      this.messageBuffer.markAllSent();
    } finally {
      unlock();
    }
  }

  /** Trims delivered packets out of the replay buffer based on the channel's buffered bytes. */
  alignReplayBuffer(bufferedAmount: number) {
    this.messageBuffer.alignBufferedAmount(bufferedAmount);
  }

  /**
   * Drops all replay state and restarts sequencing. Only valid on a full reconnect, where the
   * session (and the receivers' sequence tracking) starts over.
   */
  reset() {
    this.messageBuffer = new DataPacketBuffer();
    this.sequence = 1;
  }
}
