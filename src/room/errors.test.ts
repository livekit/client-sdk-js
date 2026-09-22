import { describe, expect, it } from 'vitest';
import { ConnectionError, canFailOverToAnotherRegion } from './errors';

describe('canFailOverToAnotherRegion', () => {
  it('allows failover on 403, which LiveKit Cloud uses to signal region pinning', () => {
    // The RTC paths 403 when the project is not allowed in the region the client geo-routed to.
    // `/settings/regions` stays reachable so the client can discover where it is allowed.
    expect(
      canFailOverToAnotherRegion(
        ConnectionError.notAllowed('project not allowed in this region.', 403),
      ),
    ).toBe(true);
  });

  it('does not allow failover on 401 — no other region will accept the same token', () => {
    expect(canFailOverToAnotherRegion(ConnectionError.notAllowed('unauthorized', 401))).toBe(false);
  });

  it('does not allow failover when the room does not exist, reported as NotAllowed with 404', () => {
    expect(
      canFailOverToAnotherRegion(ConnectionError.notAllowed('requested room does not exist', 404)),
    ).toBe(false);
  });

  it('does not allow failover on a cancelled attempt', () => {
    expect(canFailOverToAnotherRegion(ConnectionError.cancelled('aborted'))).toBe(false);
  });

  it.each([
    ['server unreachable', ConnectionError.serverUnreachable('unreachable')],
    ['timeout', ConnectionError.timeout('timed out')],
    ['internal', ConnectionError.internal('internal')],
  ])('allows failover on a %s error', (_name, error) => {
    expect(canFailOverToAnotherRegion(error)).toBe(true);
  });
});
