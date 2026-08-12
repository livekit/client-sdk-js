import { describe, expect, it } from 'vitest';
import { DataPacketBuffer } from './dataPacketBuffer';

const item = (sequence: number, size: number, sent: boolean) => ({
  data: new Uint8Array(size),
  sequence,
  sent,
});

describe('DataPacketBuffer', () => {
  it('trims sent packets down to the buffered amount', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, true));
    buffer.push(item(2, 100, true));
    buffer.push(item(3, 100, true));

    // 150 buffered bytes cover the last two packets; the first is fully delivered.
    buffer.alignBufferedAmount(150);

    expect(buffer.getAll().map((i) => i.sequence)).toEqual([2, 3]);
  });

  it('never trims unsent packets, even when the buffered amount is zero', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, false));
    buffer.push(item(2, 100, false));

    buffer.alignBufferedAmount(0);

    expect(buffer.length).toBe(2);
  });

  it('does not let unsent tail bytes cause over-trimming of the sent prefix', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, true));
    buffer.push(item(2, 100, true));
    // Queued during a reconnect window — not part of the channel's bufferedAmount.
    buffer.push(item(3, 100, false));
    buffer.push(item(4, 100, false));

    // Both sent packets are still in flight; nothing may be trimmed. With size accounting based
    // on the total (400) instead of sent bytes (200), both sent packets would be popped here.
    buffer.alignBufferedAmount(200);

    expect(buffer.getAll().map((i) => i.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('markSent makes a single packet eligible for trimming and tracks sent size', () => {
    const buffer = new DataPacketBuffer();
    const first = item(1, 100, false);
    const second = item(2, 100, false);
    buffer.push(first);
    buffer.push(second);

    // Only the marked packet can be trimmed; the still-unsent one blocks the front.
    buffer.markSent(first);
    buffer.alignBufferedAmount(0);
    expect(buffer.getAll().map((i) => i.sequence)).toEqual([1, 2]);

    buffer.markSent(second);
    buffer.alignBufferedAmount(50);
    expect(buffer.getAll().map((i) => i.sequence)).toEqual([2]);
  });

  it('getUnsent returns only unsent packets, in order', () => {
    const buffer = new DataPacketBuffer();
    const a = item(1, 100, false);
    const b = item(2, 100, false);
    buffer.push(a);
    buffer.push(b);
    buffer.push(item(3, 100, false));
    buffer.markSent(b);

    expect(buffer.getUnsent().map((i) => i.sequence)).toEqual([1, 3]);
  });

  it('markAllUnsent flags every packet for re-send and resets sent size', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, true));
    buffer.push(item(2, 100, true));

    buffer.markAllUnsent();
    expect(buffer.getUnsent().map((i) => i.sequence)).toEqual([1, 2]);

    // With everything unsent, nothing can be trimmed even at a zero buffered amount.
    buffer.alignBufferedAmount(0);
    expect(buffer.getAll().map((i) => i.sequence)).toEqual([1, 2]);
  });

  it('popToSequence drops acked packets regardless of sent state', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, true));
    buffer.push(item(2, 100, false));
    buffer.push(item(3, 100, false));

    buffer.popToSequence(2);

    expect(buffer.getAll().map((i) => i.sequence)).toEqual([3]);
  });
});
