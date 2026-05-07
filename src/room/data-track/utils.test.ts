/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { U16_MAX_SIZE, WrapAroundUnsignedInt } from './utils';

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

  it.each([
    // Happy path
    [5, 10, true],
    [10, 5, false],

    // Equality cases
    [0, 0, false],
    [7, 7, false],
    [U16_MAX_SIZE + 1, U16_MAX_SIZE + 1, false],

    // Boundary cases
    [0, 2, true],
    [U16_MAX_SIZE - 1, U16_MAX_SIZE, true],

    // Wraparound cases
    [1, U16_MAX_SIZE + 1 /* wraps around to 0 */, false],
    [U16_MAX_SIZE + 1 /* wraps around to 0 */, 5, true],
    [2, (U16_MAX_SIZE + 1) * 5 + 3 /* wraps around to 3 */, true],
    [(U16_MAX_SIZE + 1) * 5 + 3 /* wraps around to 3 */, 5, true],
  ])('should ensure isBefore works', (first, second, result) => {
    expect(
      WrapAroundUnsignedInt.u16(first).isBefore(WrapAroundUnsignedInt.u16(second)),
      `${first} isBefore ${second} != ${result}`,
    ).toStrictEqual(result);
  });
});
