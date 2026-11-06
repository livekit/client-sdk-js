import { ParticipantInfo } from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import Participant from './Participant';

describe('isOlderSession', () => {
  function participantWith(info: Partial<ParticipantInfo>) {
    const participant = new Participant(info.sid ?? '', 'tutor');
    participant.updateInfo(new ParticipantInfo({ identity: 'tutor', ...info }));
    return participant;
  }

  it('is false for the same session', () => {
    const participant = participantWith({ sid: 'PA_b', joinedAt: 10n });

    expect(participant.isOlderSession(new ParticipantInfo({ sid: 'PA_b', joinedAt: 5n }))).toBe(
      false,
    );
  });

  it('orders sessions by joinedAt first', () => {
    const participant = participantWith({ sid: 'PA_b', joinedAt: 10n, joinedAtMs: 10_000n });

    expect(
      participant.isOlderSession(
        new ParticipantInfo({ sid: 'PA_c', joinedAt: 9n, joinedAtMs: 11_000n }),
      ),
    ).toBe(true);
    expect(
      participant.isOlderSession(
        new ParticipantInfo({ sid: 'PA_a', joinedAt: 11n, joinedAtMs: 9_000n }),
      ),
    ).toBe(false);
  });

  it('uses joinedAtMs when joinedAt is equal and both have joinedAtMs', () => {
    const participant = participantWith({ sid: 'PA_b', joinedAt: 10n, joinedAtMs: 10_500n });

    expect(
      participant.isOlderSession(
        new ParticipantInfo({ sid: 'PA_c', joinedAt: 10n, joinedAtMs: 10_100n }),
      ),
    ).toBe(true);
    expect(
      participant.isOlderSession(
        new ParticipantInfo({ sid: 'PA_a', joinedAt: 10n, joinedAtMs: 10_900n }),
      ),
    ).toBe(false);
  });

  it('falls back to the higher sid when joinedAtMs is missing on either side', () => {
    const participant = participantWith({ sid: 'PA_b', joinedAt: 10n, joinedAtMs: 10_500n });

    expect(participant.isOlderSession(new ParticipantInfo({ sid: 'PA_a', joinedAt: 10n }))).toBe(
      true,
    );
    expect(participant.isOlderSession(new ParticipantInfo({ sid: 'PA_c', joinedAt: 10n }))).toBe(
      false,
    );
  });
});
