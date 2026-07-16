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

  it('markAllSent makes queued packets eligible for trimming', () => {
    const buffer = new DataPacketBuffer();
    buffer.push(item(1, 100, false));
    buffer.push(item(2, 100, false));

    buffer.markAllSent();
    buffer.alignBufferedAmount(50);

    expect(buffer.getAll().map((i) => i.sequence)).toEqual([2]);
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
