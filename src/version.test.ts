import { describe, expect, it } from 'vitest';
import { CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS, clientProtocol } from './version';

describe('clientProtocol', () => {
  it('advertises transcription stream support', () => {
    // The advertised value is a wire contract: an agent seeing >= 3 may stop publishing legacy
    // `Transcription` packets, because this client rebuilds transcription events from
    // `lk.transcription` streams. Bump this deliberately, never incidentally.
    expect(CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS).toBe(3);
    expect(clientProtocol).toBe(CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS);
  });
});
