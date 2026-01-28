/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WrapAroundUnsignedInt } from './utils';

describe('WrapAroundUnsignedInt', () => {
  it('should test initialization + edge cases', () => {
    expect(WrapAroundUnsignedInt.u16(1).value).toEqual(1);
    expect(WrapAroundUnsignedInt.u16(196_609 /* (3 * 65536) + 1 */).value).toEqual(1);
    expect(() => WrapAroundUnsignedInt.u16(-1).value).toThrow(
      'WrapAroundUnsignedInt: cannot faithfully represent an integer smaller than 0',
    );
  });
  it('should test explicit positive wrap around behavior', () => {
    const n = WrapAroundUnsignedInt.u16(65534);
    n.update((v) => v + 1);
    expect(n.value).toBe(65535);
    n.update((v) => v + 1);
    expect(n.value).toBe(0);
  });

  it('should test explicit negative wrap around behavior', () => {
    const n = WrapAroundUnsignedInt.u16(1);
    n.update((v) => v - 1);
    expect(n.value).toBe(0);
    n.update((v) => v - 1);
    expect(n.value).toBe(65535);
  });
});
