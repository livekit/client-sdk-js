import { type MediaDescription, parse } from 'sdp-transform';
import { describe, expect, it } from 'vitest';
import { conformBundledCodecFmtp, placeholderMidsFromTransceivers } from './PCTransport';

/** Parse the `key[=value]` pairs of an fmtp config into a comparable set. */
const paramSet = (config: string) => new Set(config.split(';').filter(Boolean));

const fmtpOf = (media: MediaDescription[], mid: string, payload: number) => {
  const m = media.find((section) => `${section.mid}` === mid)!;
  return m.fmtp.find((f) => f.payload === payload)?.config;
};

/** Predicate for conformBundledCodecFmtp based on an explicit set of mids. */
const placeholders = (mids: string[]) => {
  const set = new Set(mids);
  return (m: MediaDescription) => set.has(`${m.mid}`);
};

// One publisher bundle: a published mic + camera (real sends, with msid/ssrc)
// and their pre-populated recvonly placeholders.
const PUBLISHER_SDP = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1 2 3
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=mid:0
a=sendonly
a=msid:s mic
a=ssrc:1111 cname:a
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=mid:1
a=recvonly
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
m=video 9 UDP/TLS/RTP/SAVPF 49
c=IN IP4 0.0.0.0
a=mid:2
a=sendonly
a=msid:s cam
a=ssrc:2222 cname:b
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=186;profile-id=1;tier-flag=0;tx-mode=SRST
m=video 9 UDP/TLS/RTP/SAVPF 49
c=IN IP4 0.0.0.0
a=mid:3
a=recvonly
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST`;

describe('placeholderMidsFromTransceivers', () => {
  const tr = (mid: string | null, track: unknown) =>
    ({ mid, sender: { track } }) as unknown as RTCRtpTransceiver;

  it('includes transceivers with a mid and no outgoing track', () => {
    const mids = placeholderMidsFromTransceivers([
      tr('0', {}), // real send
      tr('1', null), // pre-populated placeholder
      tr('2', null), // reverted after unpublish (msid may linger in SDP, but no track)
      tr(null, null), // not yet negotiated — no mid, excluded
    ]);
    expect(mids).toEqual(new Set(['1', '2']));
  });
});

describe('conformBundledCodecFmtp', () => {
  it('copies opus and H.265 fmtp from real sections onto placeholders', () => {
    const { media } = parse(PUBLISHER_SDP);

    conformBundledCodecFmtp(media, placeholders(['1', '3']));

    expect(fmtpOf(media, '1', 111)).toBe(fmtpOf(media, '0', 111));
    expect(paramSet(fmtpOf(media, '1', 111)!)).toContain('usedtx=1');
    expect(fmtpOf(media, '3', 49)).toBe(fmtpOf(media, '2', 49));
    expect(paramSet(fmtpOf(media, '3', 49)!)).toContain('level-id=186');
  });

  it('never rewrites the real (non-placeholder) sections', () => {
    const { media } = parse(PUBLISHER_SDP);

    conformBundledCodecFmtp(media, placeholders(['1', '3']));

    expect(fmtpOf(media, '0', 111)).toBe('minptime=10;useinbandfec=1;usedtx=1');
    expect(paramSet(fmtpOf(media, '2', 49)!)).toContain('level-id=186');
  });

  it('converges divergent placeholders even when no real section declares the payload', () => {
    // Two placeholders that disagree (a reverted one kept level 186, a fresh one
    // has 180) with no active send present.
    const { media } = parse(`v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 10 11
m=video 9 UDP/TLS/RTP/SAVPF 49
a=mid:10
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=186;profile-id=1;tier-flag=0;tx-mode=SRST
m=video 9 UDP/TLS/RTP/SAVPF 49
a=mid:11
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST`);

    conformBundledCodecFmtp(media, placeholders(['10', '11']));

    expect(fmtpOf(media, '10', 49)).toBe(fmtpOf(media, '11', 49));
  });

  it('conforms a reverted section that kept its msid (second-publish case)', () => {
    // The real second publish: a live camera send (level 186), plus the section
    // left over from the first (unpublished) track. Chrome keeps that section's
    // `a=msid`/`a=ssrc` even though it no longer sends, so it must be identified
    // as a placeholder by its transceiver (no track), not by SDP.
    const { media } = parse(`v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 3 4 5
m=video 9 UDP/TLS/RTP/SAVPF 49
a=mid:3
a=sendonly
a=msid:s cam
a=ssrc:9 cname:c
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=186;profile-id=1;tier-flag=0;tx-mode=SRST
m=video 9 UDP/TLS/RTP/SAVPF 49
a=mid:4
a=sendonly
a=msid:s stale
a=ssrc:8 cname:d
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST
m=video 9 UDP/TLS/RTP/SAVPF 49
a=mid:5
a=recvonly
a=rtpmap:49 H265/90000
a=fmtp:49 level-id=180;profile-id=1;tier-flag=0;tx-mode=SRST`);

    // mid 4 still has msid/ssrc in the SDP, but its transceiver has no track.
    conformBundledCodecFmtp(media, placeholders(['4', '5']));

    expect(paramSet(fmtpOf(media, '3', 49)!)).toContain('level-id=186'); // real send untouched
    expect(fmtpOf(media, '4', 49)).toBe(fmtpOf(media, '3', 49)); // stale conformed
    expect(fmtpOf(media, '5', 49)).toBe(fmtpOf(media, '3', 49)); // placeholder conformed
  });
});
