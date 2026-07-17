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
      await this.waitForHeadroomWithLock();
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
    this.refreshBufferStatus();
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
      // Everything left after the ack cutoff must be re-handed to the current channel.
      this.messageBuffer.markAllUnsent();
      // Drain in passes, re-scanning the live buffer each time: a send that arrives (deferred,
      // sent:false) during our own awaits appends after this pass started, so we pick it up on
      // the next one. Mark each packet only once we've actually handed it to the channel — a
      // blanket "mark all sent" would flip such a late arrival to sent without transmitting it,
      // and a later alignBufferedAmount would then drop it for good. If the loop throws
      // mid-drain, unsent entries keep their flag and the next replay picks them up.
      for (
        let batch = this.messageBuffer.getUnsent();
        batch.length > 0;
        batch = this.messageBuffer.getUnsent()
      ) {
        for (const item of batch) {
          // Respect flow control on resume too, so a large resend doesn't overflow the buffer.
          await this.waitForHeadroomWithoutLock();
          dc.send(item.data);
          this.messageBuffer.markSent(item);
        }
      }
    } finally {
      unlock();
    }
    this.refreshBufferStatus();
  }

  /**
   * Before recomputing status, trim packets the transport has now delivered — a send or a drain
   * may have acked buffered packets, and the replay buffer is keyed off the channel's buffered
   * bytes.
   */
  override refreshBufferStatus() {
    const dc = this.channelHandle;
    if (dc) {
      this.messageBuffer.alignBufferedAmount(dc.bufferedAmount);
    }
    super.refreshBufferStatus();
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
