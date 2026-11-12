import { describe, expect, it } from 'vitest';
import * as core from '../../src/core';
import * as main from '../../src/index';
import released from './exports.json';

// break-check runs the list of the last release against the current source: a removed name is a
// break, a new one is not. Without it the list must match, so a new export gets recorded.
const restored = !!process.env.BREAK_CHECK;

describe.each([
  ['livekit-client', main, released.main],
  ['livekit-client/core', core, released.core],
])('value exports of %s', (_entry, entry, names) => {
  it('keeps every released name', () => {
    expect(names.filter((name) => !(name in entry))).toEqual([]);
  });

  it.skipIf(restored)('lists every name in exports.json', () => {
    expect(Object.keys(entry).filter((name) => !names.includes(name))).toEqual([]);
  });
});
