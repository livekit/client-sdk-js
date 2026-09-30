import { describe, expect, it } from 'vitest';
import { ACTIONS_ATTRIBUTE, parseActions } from './actions';

describe('parseActions', () => {
  it('parses name and summary catalog entries', () => {
    const actions = [{ name: 'read_file', summary: 'Read a file under ~/src' }, { name: 'ping' }];
    expect(parseActions({ [ACTIONS_ATTRIBUTE]: JSON.stringify(actions) })).toEqual(actions);
  });

  it('returns an empty list when the attribute is missing or malformed', () => {
    expect(parseActions({})).toEqual([]);
    expect(parseActions({ [ACTIONS_ATTRIBUTE]: 'not json' })).toEqual([]);
    expect(parseActions({ [ACTIONS_ATTRIBUTE]: '{"name":"x"}' })).toEqual([]);
  });
});
