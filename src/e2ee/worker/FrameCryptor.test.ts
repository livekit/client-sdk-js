import { describe, expect, it } from 'vitest';
import { isFrameServerInjected } from './FrameCryptor';

describe('FrameCryptor', () => {
  it('identifies server injected frame correctly', () => {
    const frameTrailer = new TextEncoder().encode('LKROCKS');
    const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...frameTrailer]).buffer;

    expect(isFrameServerInjected(frameData, frameTrailer)).toBe(true);
  });
  it('identifies server non server injected frame correctly', () => {
    const frameTrailer = new TextEncoder().encode('LKROCKS');
    const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...frameTrailer, 10]);

    expect(isFrameServerInjected(frameData.buffer, frameTrailer)).toBe(false);
    frameData.fill(0);
    expect(isFrameServerInjected(frameData.buffer, frameTrailer)).toBe(false);
  });
});
