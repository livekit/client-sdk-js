import { describe, expect, it } from 'vitest';
import { RpcError, byteLength, truncateBytes } from './utils';

describe('truncateBytes', () => {
  it('returns the string unchanged when it fits', () => {
    expect(truncateBytes('hello', 5)).toBe('hello');
  });

  it('truncates ASCII on the byte limit', () => {
    expect(truncateBytes('hello world', 5)).toBe('hello');
  });

  it('does not split a multibyte character', () => {
    expect(truncateBytes('aéé', 4)).toBe('aé');
  });

  it('does not leave half of a surrogate pair when truncating emoji', () => {
    // 'a' (1 byte) + 63 emoji (4 bytes each) = 253 bytes, so the limit falls inside the next emoji.
    const str = `a${'😀'.repeat(64)}`;
    const truncated = truncateBytes(str, 256);

    expect(truncated).toBe(`a${'😀'.repeat(63)}`);
    expect(new TextDecoder().decode(new TextEncoder().encode(truncated))).toBe(truncated);
  });

  it('keeps an RpcError message valid when it is cut inside an emoji', () => {
    const error = new RpcError(1500, `a${'😀'.repeat(100)}`);

    expect(byteLength(error.message)).toBeLessThanOrEqual(RpcError.MAX_MESSAGE_BYTES);
    expect(error.message).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});
