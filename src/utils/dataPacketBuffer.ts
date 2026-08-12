import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';

export interface DataPacketItem {
  data: NonSharedUint8Array;
  sequence: number;
  /**
   * Whether the packet has been handed to the data channel. Unsent packets are queued for the
   * resume replay (e.g. sends that landed in a reconnect window) and must never be trimmed by
   * {@link DataPacketBuffer.alignBufferedAmount}, which reasons about the channel's buffered
   * bytes — those only ever contain sent packets.
   */
  sent: boolean;
}

export class DataPacketBuffer {
  private buffer: DataPacketItem[] = [];

  private _totalSize = 0;

  private _sentSize = 0;

  push(item: DataPacketItem) {
    this.buffer.push(item);
    this._totalSize += item.data.byteLength;
    if (item.sent) {
      this._sentSize += item.data.byteLength;
    }
  }

  pop(): DataPacketItem | undefined {
    const item = this.buffer.shift();
    if (item) {
      this._totalSize -= item.data.byteLength;
      if (item.sent) {
        this._sentSize -= item.data.byteLength;
      }
    }
    return item;
  }

  getAll(): DataPacketItem[] {
    return this.buffer.slice();
  }

  /** Every queued packet not yet handed to the channel, in sequence order. */
  getUnsent(): DataPacketItem[] {
    return this.buffer.filter((item) => !item.sent);
  }

  /** Marks a single queued packet as handed to the channel. */
  markSent(item: DataPacketItem) {
    if (!item.sent) {
      item.sent = true;
      this._sentSize += item.data.byteLength;
    }
  }

  /**
   * Marks every queued packet as not-yet-sent. Used at the start of a resume replay: whatever is
   * still buffered was sent on the previous channel (or deferred) and must be re-handed to the
   * current one, so none of it counts as sent until the replay actually transmits it.
   */
  markAllUnsent() {
    for (const item of this.buffer) {
      item.sent = false;
    }
    this._sentSize = 0;
  }

  popToSequence(sequence: number) {
    while (this.buffer.length > 0) {
      const first = this.buffer[0];
      if (first.sequence <= sequence) {
        this.pop();
      } else {
        break;
      }
    }
  }

  alignBufferedAmount(bufferedAmount: number) {
    while (this.buffer.length > 0) {
      const first = this.buffer[0];
      // Unsent packets aren't part of the channel's bufferedAmount and are still awaiting the
      // resume replay — trimming them would silently lose them.
      if (!first.sent) {
        break;
      }
      if (this._sentSize - first.data.byteLength <= bufferedAmount) {
        break;
      }
      this.pop();
    }
  }

  get length(): number {
    return this.buffer.length;
  }
}
