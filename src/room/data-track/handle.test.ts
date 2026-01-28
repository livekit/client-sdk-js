/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTrackHandle } from './handle';

describe('DataTrackHandle', () => {
  it('should parse handle raw inputs', () => {
    expect(DataTrackHandle.fromNumber(3).value).toEqual(3);
    expect(() => DataTrackHandle.fromNumber(0)).toThrow('0x0 is a reserved value');
    expect(() => DataTrackHandle.fromNumber(9999999)).toThrow(
      'Value too large to be a valid track handle',
    );
  });
});
