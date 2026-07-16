import type { PCTransportManager } from '../PCTransportManager';
import { FlowControlledDataChannel } from './FlowControlledDataChannel';
import { LossyDataChannel } from './LossyDataChannel';
import { ReliableDataChannel } from './ReliableDataChannel';
import { DataChannelKind, dataChannelHighWaterMark, dataChannelLowWaterMark } from './types';

const lossyDataChannelLabel = '_lossy';
const reliableDataChannelLabel = '_reliable';
const dataTrackDataChannelLabel = '_data_track';

export interface DataChannelManagerOptions {
  /** Whether the owning engine has been closed — a closed engine rejects headroom waiters. */
  isEngineClosed: () => boolean;
  /**
   * Whether a reconnect attempt is underway: reliable sends defer to the resume replay and lossy
   * sends are skipped while this is true.
   */
  isReconnecting: () => boolean;
  onDataMessage: (message: MessageEvent) => void;
  onDataTrackMessage: (message: MessageEvent) => void;
  onDataError: (event: Event) => void;
  onChannelClose: (kind: DataChannelKind) => void;
  /** A channel's buffer crossed its low-water mark (debounced). Drives DCBufferStatusChanged. */
  onBufferStatusChanged: (kind: DataChannelKind, isLow: boolean) => void;
}

/**
 * Owns the engine's data channels: the three flow-controlled publisher channel wrappers (which
 * live for the engine's lifetime and have RTCDataChannel handles attached/detached as peer
 * connections come and go) plus the subscriber-side receive handles adopted by label.
 *
 * Handle turnover goes through {@link FlowControlledDataChannel.attach}/`detach`, which reject
 * parked headroom waiters as a built-in — there is no separate invalidation step to forget.
 */
export class DataChannelManager {
  readonly reliable: ReliableDataChannel;

  readonly lossy: LossyDataChannel;

  readonly dataTrack: LossyDataChannel;

  private reliableSub?: RTCDataChannel;

  private lossySub?: RTCDataChannel;

  private dataTrackSub?: RTCDataChannel;

  private opts: DataChannelManagerOptions;

  constructor(opts: DataChannelManagerOptions) {
    this.opts = opts;
    const flowControlOptions = (kind: DataChannelKind) => ({
      kind,
      lowWaterMark: dataChannelLowWaterMark(kind),
      highWaterMark: dataChannelHighWaterMark(kind),
      isEngineClosed: opts.isEngineClosed,
      onBufferStatusChanged: (isLow: boolean) => opts.onBufferStatusChanged(kind, isLow),
    });
    this.reliable = new ReliableDataChannel({
      ...flowControlOptions(DataChannelKind.RELIABLE),
      isDeferringSends: opts.isReconnecting,
    });
    this.lossy = new LossyDataChannel({
      ...flowControlOptions(DataChannelKind.LOSSY),
      // Classic lossy user data: a stale packet is worthless, so drop instead of queueing.
      bufferFullBehavior: 'drop',
      shouldSkipSends: opts.isReconnecting,
    });
    this.dataTrack = new LossyDataChannel({
      ...flowControlOptions(DataChannelKind.DATA_TRACK_LOSSY),
      // Data tracks backpressure the producer instead — it decides what to skip at frame
      // granularity rather than the engine dropping arbitrary chunks out of frames.
      bufferFullBehavior: 'wait',
      shouldSkipSends: opts.isReconnecting,
    });
  }

  /** The flow-control wrapper for `kind`. */
  channelFor(kind: DataChannelKind): FlowControlledDataChannel {
    switch (kind) {
      case DataChannelKind.RELIABLE:
        return this.reliable;
      case DataChannelKind.LOSSY:
        return this.lossy;
      case DataChannelKind.DATA_TRACK_LOSSY:
        return this.dataTrack;
    }
  }

  /** The raw RTCDataChannel handle for `kind`, publisher side by default. */
  getHandle(kind: DataChannelKind, subscriber: boolean = false): RTCDataChannel | undefined {
    if (!subscriber) {
      return this.channelFor(kind).channelHandle;
    }
    switch (kind) {
      case DataChannelKind.RELIABLE:
        return this.reliableSub;
      case DataChannelKind.LOSSY:
        return this.lossySub;
      case DataChannelKind.DATA_TRACK_LOSSY:
        return this.dataTrackSub;
    }
  }

  get hasPublisherChannels(): boolean {
    return Boolean(
      this.reliable.channelHandle || this.lossy.channelHandle || this.dataTrack.channelHandle,
    );
  }

  /**
   * Creates the three publisher data channels on the given transport, wires their handlers, and
   * attaches them to the wrappers — attaching rejects any waiters still parked on replaced
   * channel objects.
   */
  createPublisherChannels(pcManager: PCTransportManager) {
    // clear old data channel callbacks if recreate
    for (const channel of [this.lossy, this.reliable, this.dataTrack]) {
      const old = channel.channelHandle;
      if (old) {
        old.onmessage = null;
        old.onerror = null;
        old.onclose = null;
      }
    }

    const wire = (
      channel: FlowControlledDataChannel,
      dc: RTCDataChannel,
      onMessage: (message: MessageEvent) => void,
    ) => {
      // also handle messages over the pub channel, for backwards compatibility
      dc.onmessage = onMessage;
      // handle datachannel errors
      dc.onerror = this.opts.onDataError;
      // detect unexpected publisher data channel closes
      dc.onclose = () => this.opts.onChannelClose(channel.kind);
      // set up dc buffer threshold - if this is not set, it will default to 0
      dc.bufferedAmountLowThreshold = channel.lowWaterMark;
      // handle buffer amount low events
      dc.onbufferedamountlow = () => channel.refreshBufferStatus();
      channel.attach(dc);
    };

    wire(
      this.lossy,
      pcManager.createPublisherDataChannel(lossyDataChannelLabel, {
        ordered: false,
        maxRetransmits: 0,
      }),
      this.opts.onDataMessage,
    );
    wire(
      this.reliable,
      pcManager.createPublisherDataChannel(reliableDataChannelLabel, {
        ordered: true,
      }),
      this.opts.onDataMessage,
    );
    wire(
      this.dataTrack,
      pcManager.createPublisherDataChannel(dataTrackDataChannelLabel, {
        ordered: false,
        maxRetransmits: 0,
      }),
      this.opts.onDataTrackMessage,
    );

    this.lossy.startThresholdTuning();
  }

  /**
   * Adopts a subscriber-side data channel by label, wiring the matching receive handler.
   * Returns false for labels this manager doesn't own.
   */
  adoptSubscriberChannel(channel: RTCDataChannel): boolean {
    let handler: (message: MessageEvent) => void;
    if (channel.label === reliableDataChannelLabel) {
      this.reliableSub = channel;
      handler = this.opts.onDataMessage;
    } else if (channel.label === lossyDataChannelLabel) {
      this.lossySub = channel;
      handler = this.opts.onDataMessage;
    } else if (channel.label === dataTrackDataChannelLabel) {
      this.dataTrackSub = channel;
      handler = this.opts.onDataTrackMessage;
    } else {
      return false;
    }
    channel.onmessage = handler;
    return true;
  }

  /**
   * Tears down all channels for a peer-connection cleanup: rejects parked waiters (detach — the
   * spec allows `pc.close()` to transition channels to 'closed' without firing events, so waiting
   * for browser close events is not an option), strips handlers, closes the handles, and resets
   * the reliable session state.
   */
  teardown() {
    const dcCleanup = (dc: RTCDataChannel | undefined) => {
      if (!dc) {
        return;
      }

      // Detach the data channel handlers before closing anything. Closing a peer connection tears
      // down the SCTP transport, which can dispatch `error`/`close` events on the still-open data
      // channels; if our handlers are still attached at that point, handleDataError logs a spurious
      // "Unknown DataChannel error" during an otherwise graceful disconnect. Removing the handlers
      // before dc.close()/pcManager.close() makes this deterministic regardless of how/when the
      // browser dispatches those teardown events. See livekit/client-sdk-js#1953.
      dc.onbufferedamountlow = null;
      dc.onclose = null;
      dc.onclosing = null;
      dc.onerror = null;
      dc.onmessage = null;
      dc.onopen = null;

      dc.close();
    };

    for (const channel of [this.lossy, this.reliable, this.dataTrack]) {
      const dc = channel.channelHandle;
      channel.detach('peer connections cleaned up');
      dcCleanup(dc);
    }
    dcCleanup(this.lossySub);
    dcCleanup(this.reliableSub);
    dcCleanup(this.dataTrackSub);
    this.lossySub = undefined;
    this.reliableSub = undefined;
    this.dataTrackSub = undefined;

    // Full teardown starts the session over: drop replay state and restart sequencing.
    this.reliable.reset();
  }
}
