import { type MediaDescription, parse } from 'sdp-transform';
import { describe, expect, it } from 'vitest';
import { conformBundledCodecFmtp, isPlaceholderOfferSection } from './PCTransport';

/** Parse the `key[=value]` pairs of an fmtp config into a comparable set. */
const paramSet = (config: string) => new Set(config.split(';').filter(Boolean));

const fmtpOf = (media: MediaDescription[], mid: string, payload: number) => {
  const m = media.find((section) => `${section.mid}` === mid)!;
  return m.fmtp.find((f) => f.payload === payload)?.config;
};

// One publisher bundle: a published mic + camera and their pre-populated
// recvonly placeholders. The real sections carry the negotiated params
// (opus usedtx, H.265 level-id 186); the placeholders carry codec defaults.
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

describe('isPlaceholderOfferSection', () => {
  it('flags recvonly sections with no outgoing media', () => {
    const { media } = parse(PUBLISHER_SDP);
    expect(isPlaceholderOfferSection(media.find((m) => `${m.mid}` === '1')!)).toBe(true);
    expect(isPlaceholderOfferSection(media.find((m) => `${m.mid}` === '3')!)).toBe(true);
  });

  it('does not flag sending sections or recvonly sections that carry media', () => {
    const { media } = parse(PUBLISHER_SDP);
    // sendonly mic/camera
    expect(isPlaceholderOfferSection(media.find((m) => `${m.mid}` === '0')!)).toBe(false);
    // recvonly but with an msid (a real subscription, not a placeholder)
    const recvWithMsid = { ...media[1], msid: 's remote' } as MediaDescription;
    expect(isPlaceholderOfferSection(recvWithMsid)).toBe(false);
  });
});

describe('conformBundledCodecFmtp', () => {
  it('copies opus and H.265 fmtp from real sections onto placeholders', () => {
    const { media } = parse(PUBLISHER_SDP);

    conformBundledCodecFmtp(media, isPlaceholderOfferSection);

    // opus placeholder (mid 1) gains usedtx from the mic (mid 0)
    expect(fmtpOf(media, '1', 111)).toBe(fmtpOf(media, '0', 111));
    expect(paramSet(fmtpOf(media, '1', 111)!)).toContain('usedtx=1');

    // H.265 placeholder (mid 3) takes the camera's level-id (mid 2)
    expect(fmtpOf(media, '3', 49)).toBe(fmtpOf(media, '2', 49));
    expect(paramSet(fmtpOf(media, '3', 49)!)).toContain('level-id=186');
  });

  it('never rewrites the real (non-placeholder) sections', () => {
    const { media } = parse(PUBLISHER_SDP);

    conformBundledCodecFmtp(media, isPlaceholderOfferSection);

    expect(fmtpOf(media, '0', 111)).toBe('minptime=10;useinbandfec=1;usedtx=1');
    expect(paramSet(fmtpOf(media, '2', 49)!)).toContain('level-id=186');
  });

  it('is a no-op when there are no real sections to source params from', () => {
    // Only placeholders present (e.g. before any track is published).
    const placeholdersOnly = parse(PUBLISHER_SDP);
    const onlyRecv = placeholdersOnly.media.filter((m) => m.direction === 'recvonly');
    const before = onlyRecv.map((m) => m.fmtp.map((f) => f.config));

    conformBundledCodecFmtp(onlyRecv, isPlaceholderOfferSection);

    expect(onlyRecv.map((m) => m.fmtp.map((f) => f.config))).toEqual(before);
  });
});
