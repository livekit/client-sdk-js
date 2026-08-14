import { type MediaDescription, parse } from 'sdp-transform';
import { describe, expect, it } from 'vitest';
import {
  applyVideoStartBitrate,
  conformBundledCodecFmtp,
  ensureAudioNackAndStereo,
  ensureVideoDDExtension,
  extractStereoAndNackAudioFromOffer,
  fmtpConfigHasParam,
  placeholderMidsFromTransceivers,
  videoSectionCanReceiveAV1,
} from './PCTransport';
import { ddExtensionURI } from './utils';

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

describe('video start bitrate', () => {
  it('applies the bitrate only to the section whose msid track ID matches the cid', () => {
    const { media } = parse(`v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:0
a=sendonly
a=msid:PA_remote|camera other-track
a=rtpmap:96 VP8/90000
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:1
a=sendonly
a=msid:PA_remote|camera camera-cid
a=rtpmap:96 VP8/90000`);

    for (const section of media) {
      applyVideoStartBitrate(section, 'camera-cid', 'VP8', 1_000);
    }

    expect(fmtpOf(media, '0', 96)).toBeUndefined();
    expect(paramSet(fmtpOf(media, '1', 96)!)).toContain('x-google-start-bitrate=900');
  });
});

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

describe('fmtpConfigHasParam', () => {
  it('matches a whole `;`-delimited parameter, not a substring', () => {
    // `stereo=1` is a substring of `sprop-stereo=1` — an exact-token match must
    // not treat the latter as declaring the former.
    expect(fmtpConfigHasParam('minptime=10;stereo=1', 'stereo=1')).toBe(true);
    expect(fmtpConfigHasParam('minptime=10;sprop-stereo=1', 'stereo=1')).toBe(false);
    expect(fmtpConfigHasParam('minptime=10;sprop-stereo=1', 'sprop-stereo=1')).toBe(true);
  });

  it('tolerates surrounding whitespace between parameters', () => {
    expect(fmtpConfigHasParam('minptime=10; stereo=1', 'stereo=1')).toBe(true);
  });
});

/** Build a parsed audio media section from its `a=` lines for the munge helpers. */
const audioSection = (rtpmap: string, fmtp: string, mid = '0') =>
  parse(`v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=mid:${mid}
${rtpmap}
${fmtp}`).media[0];

describe('ensureAudioNackAndStereo', () => {
  it('adds stereo=1 even when sprop-stereo=1 is already present', () => {
    const media = audioSection(
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;sprop-stereo=1',
    );

    ensureAudioNackAndStereo(media as any, ['all'], []);

    const config = media.fmtp.find((f) => f.payload === 111)!.config;
    expect(paramSet(config)).toContain('stereo=1');
    expect(paramSet(config)).toContain('sprop-stereo=1');
  });

  it('does not add a duplicate stereo=1 when it is already present', () => {
    const media = audioSection('a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;stereo=1');

    ensureAudioNackAndStereo(media as any, ['all'], []);

    const config = media.fmtp.find((f) => f.payload === 111)!.config;
    expect(config.match(/(?:^|;)stereo=1(?:;|$)/g)).toHaveLength(1);
  });

  it('matches the opus codec case-insensitively (RFC 4855)', () => {
    const media = audioSection('a=rtpmap:111 OPUS/48000/2', 'a=fmtp:111 minptime=10');

    ensureAudioNackAndStereo(media as any, ['all'], []);

    expect(paramSet(media.fmtp.find((f) => f.payload === 111)!.config)).toContain('stereo=1');
  });
});

describe('extractStereoAndNackAudioFromOffer', () => {
  const offerWith = (rtpmap: string, fmtp: string) => ({
    type: 'offer' as const,
    sdp: `v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=mid:0
${rtpmap}
${fmtp}`,
  });

  it('detects sprop-stereo=1 as a whole parameter', () => {
    const { stereoMids } = extractStereoAndNackAudioFromOffer(
      offerWith('a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;sprop-stereo=1'),
    );
    expect(stereoMids).toEqual(['0']);
  });

  it('does not treat plain stereo=1 as sprop-stereo=1', () => {
    const { stereoMids } = extractStereoAndNackAudioFromOffer(
      offerWith('a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;stereo=1'),
    );
    expect(stereoMids).toEqual([]);
  });

  it('matches the opus codec case-insensitively (RFC 4855)', () => {
    const { stereoMids } = extractStereoAndNackAudioFromOffer(
      offerWith('a=rtpmap:111 OPUS/48000/2', 'a=fmtp:111 minptime=10;sprop-stereo=1'),
    );
    expect(stereoMids).toEqual(['0']);
  });
});

// A single peer connection bundle as Chrome offers it: the section our camera sends on, the
// recvonly sections subscribed tracks arrive on, and one that lost AV1 in negotiation.
const SINGLE_PC_OFFER = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1 2
m=video 9 UDP/TLS/RTP/SAVPF 96 45
c=IN IP4 0.0.0.0
a=mid:0
a=sendonly
a=msid:s cam
a=rtpmap:96 VP8/90000
a=rtpmap:45 AV1/90000
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id
m=video 9 UDP/TLS/RTP/SAVPF 96 45
c=IN IP4 0.0.0.0
a=mid:1
a=recvonly
a=rtpmap:96 VP8/90000
a=rtpmap:45 AV1/90000
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:2
a=recvonly
a=rtpmap:96 VP8/90000
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time`;

const sectionOf = (media: MediaDescription[], mid: string) =>
  media.find((section) => `${section.mid}` === mid)!;

const ddOf = (media: MediaDescription[], mid: string) =>
  sectionOf(media, mid).ext?.find((ext) => ext.uri === ddExtensionURI)?.value;

describe('videoSectionCanReceiveAV1', () => {
  const { media } = parse(SINGLE_PC_OFFER);

  it('is true for a section we receive on that kept AV1', () => {
    expect(videoSectionCanReceiveAV1(sectionOf(media, '1'))).toBe(true);
  });

  it('is false for a send-only section, where the SVC path owns the extension', () => {
    expect(videoSectionCanReceiveAV1(sectionOf(media, '0'))).toBe(false);
  });

  it('is false when AV1 did not survive negotiation', () => {
    expect(videoSectionCanReceiveAV1(sectionOf(media, '2'))).toBe(false);
  });
});

describe('ensureVideoDDExtension', () => {
  it('assigns an id above every extension in the bundle', () => {
    const sdp = parse(SINGLE_PC_OFFER);
    // 11 is the highest in use, across all sections rather than just this one
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 0)).toBe(12);
    expect(ddOf(sdp.media, '1')).toBe(12);
  });

  it('reuses the id already chosen for the connection', () => {
    const sdp = parse(SINGLE_PC_OFFER);
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 7)).toBe(7);
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '2'), sdp, 7)).toBe(7);
    expect(ddOf(sdp.media, '1')).toBe(7);
    expect(ddOf(sdp.media, '2')).toBe(7);
  });

  it('leaves a section that already carries the extension alone', () => {
    const sdp = parse(`${SINGLE_PC_OFFER}
a=extmap:3 ${ddExtensionURI}`);
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '2'), sdp, 0)).toBe(0);
    expect(sectionOf(sdp.media, '2').ext).toHaveLength(2);
    expect(ddOf(sdp.media, '2')).toBe(3);
  });

  it('adds the extension to a section that has none', () => {
    const sdp = parse(SINGLE_PC_OFFER);
    const section = sectionOf(sdp.media, '1');
    delete section.ext;
    expect(ensureVideoDDExtension(section, sdp, 0)).toBe(12);
    expect(ddOf(sdp.media, '1')).toBe(12);
  });
});
