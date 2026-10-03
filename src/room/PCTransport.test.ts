import { type MediaDescription, parse } from 'sdp-transform';
import { describe, expect, it } from 'vitest';
import {
  applyVideoStartBitrate,
  computeConnectionStartBitrate,
  computeTrackStartBitrate,
  conformBundledCodecFmtp,
  ensureAudioNackAndStereo,
  ensureVideoDDExtension,
  extractStereoAndNackAudioFromOffer,
  findTrackCodecPayload,
  fmtpConfigHasParam,
  isDuplicateAnswer,
  placeholderMidsFromTransceivers,
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

const TWO_VIDEO_SECTIONS = `v=0
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
a=rtpmap:96 VP8/90000`;

// The same bundle after the screen share is unpublished: `unpublishTrack` sets the
// transceiver to `inactive`, but the section keeps its `a=msid`, so it still matches the
// append-only trackBitrates entry. Only the camera is still sending.
const UNPUBLISHED_SCREEN_SHARE = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:0
a=inactive
a=msid:PA_remote|camera other-track
a=rtpmap:96 VP8/90000
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:1
a=sendonly
a=msid:PA_remote|camera camera-cid
a=rtpmap:96 VP8/90000`;

// The legacy `addTrack` fallback (no `addTransceiver` support) reuses a transceiver instead
// of creating a sendonly one, so the published camera lands on a `sendrecv` section. Mid 1
// omits the direction attribute entirely, which SDP also defaults to sendrecv. Both send.
const LEGACY_ADD_TRACK_SECTIONS = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:0
a=sendrecv
a=msid:PA_remote|camera camera-cid
a=rtpmap:96 VP8/90000
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:1
a=msid:PA_remote|camera other-track
a=rtpmap:96 VP8/90000`;

describe('video start bitrate', () => {
  it('matches only the section whose msid track ID matches the cid', () => {
    const { media } = parse(TWO_VIDEO_SECTIONS);

    expect(findTrackCodecPayload(media[0], 'camera-cid', 'VP8')).toBeUndefined();
    expect(findTrackCodecPayload(media[1], 'camera-cid', 'VP8')).toBe(96);
    // Section belongs to the track but does not offer the codec.
    expect(findTrackCodecPayload(media[1], 'camera-cid', 'AV1')).toBe(0);
  });

  it('applies the bitrate only to the section it is given', () => {
    const { media } = parse(TWO_VIDEO_SECTIONS);

    applyVideoStartBitrate(media[1], 96, 900);

    expect(fmtpOf(media, '0', 96)).toBeUndefined();
    expect(paramSet(fmtpOf(media, '1', 96)!)).toContain('x-google-start-bitrate=900');
  });

  it('caps camera at 1 Mbps but leaves screen share uncapped', () => {
    const camera = { cid: 'c', codec: 'VP8', maxbr: 3_000 };
    const screenShare = { ...camera, isScreenShare: true };

    expect(computeTrackStartBitrate(camera)).toBe(1_000);
    expect(computeTrackStartBitrate(screenShare)).toBe(2_700);
  });

  it('gives no hint below the 300 kbps target floor', () => {
    expect(computeTrackStartBitrate({ cid: 'c', codec: 'VP8', maxbr: 299 })).toBeUndefined();
    expect(computeTrackStartBitrate({ cid: 'c', codec: 'VP8', maxbr: 300 })).toBe(270);
  });

  it('uses one connection-level value: the largest hint across video sections', () => {
    const { media } = parse(TWO_VIDEO_SECTIONS);

    const startBitrate = computeConnectionStartBitrate(media, [
      { cid: 'camera-cid', codec: 'VP8', maxbr: 1_000 },
      { cid: 'other-track', codec: 'VP8', maxbr: 3_000, isScreenShare: true },
    ]);

    expect(startBitrate).toBe(2_700);
  });

  it('ignores registered tracks with no section in the current SDP', () => {
    const { media } = parse(TWO_VIDEO_SECTIONS);

    const startBitrate = computeConnectionStartBitrate(media, [
      { cid: 'camera-cid', codec: 'VP8', maxbr: 1_000 },
      // Stale entry: trackBitrates is append-only and outlives an unpublish.
      { cid: 'unpublished-cid', codec: 'VP8', maxbr: 8_000, isScreenShare: true },
    ]);

    expect(startBitrate).toBe(900);
  });

  it('ignores a section that stopped sending but kept its msid', () => {
    const trackBitrates = [
      { cid: 'camera-cid', codec: 'VP8', maxbr: 1_000 },
      { cid: 'other-track', codec: 'VP8', maxbr: 8_000, isScreenShare: true },
    ];

    // While both send, the uncapped screen share wins the connection-level max.
    expect(computeConnectionStartBitrate(parse(TWO_VIDEO_SECTIONS).media, trackBitrates)).toBe(
      7_200,
    );
    // Once it is unpublished its entry is stale, so only the capped camera counts. Both
    // directions a removed sender can land on are excluded: `inactive` from a sendonly
    // transceiver, `recvonly` from the sendrecv one the addTrack fallback reuses.
    expect(
      computeConnectionStartBitrate(parse(UNPUBLISHED_SCREEN_SHARE).media, trackBitrates),
    ).toBe(900);
    expect(
      computeConnectionStartBitrate(
        parse(UNPUBLISHED_SCREEN_SHARE.replace('a=inactive', 'a=recvonly')).media,
        trackBitrates,
      ),
    ).toBe(900);
  });

  it('gives no connection value when no section maps to a published track', () => {
    const { media } = parse(TWO_VIDEO_SECTIONS);

    expect(computeConnectionStartBitrate(media, [])).toBeUndefined();
  });

  it('counts sendrecv and direction-less sections, which still send local media', () => {
    // The legacy addTrack fallback never produces `sendonly`, so a strict match on it would
    // leave those clients with no hint at all.
    const { media } = parse(LEGACY_ADD_TRACK_SECTIONS);

    expect(
      computeConnectionStartBitrate(media, [{ cid: 'camera-cid', codec: 'VP8', maxbr: 1_000 }]),
    ).toBe(900);
    expect(
      computeConnectionStartBitrate(media, [
        { cid: 'other-track', codec: 'VP8', maxbr: 2_000, isScreenShare: true },
      ]),
    ).toBe(1_800);
  });

  it('leaves the hint unset when only non-sending sections match', () => {
    // Nothing is published, so the one-shot hint must not be consumed on a dead section.
    const { media } = parse(UNPUBLISHED_SCREEN_SHARE);

    expect(
      computeConnectionStartBitrate(media, [
        { cid: 'other-track', codec: 'VP8', maxbr: 8_000, isScreenShare: true },
      ]),
    ).toBeUndefined();
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

  it('leaves a section that already carries the extension alone, and reports its id', () => {
    const sdp = parse(`${SINGLE_PC_OFFER}
a=extmap:3 ${ddExtensionURI}`);
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '2'), sdp, 0)).toBe(3);
    expect(sectionOf(sdp.media, '2').ext).toHaveLength(2);
    expect(ddOf(sdp.media, '2')).toBe(3);
  });

  it('adopts the id the browser already advertises rather than inventing a second one', () => {
    // Chrome maps the extension itself on the section it sends AV1 on, but not on recvonly
    // ones. A bundle has to map the URI to one id, so the send section's id has to win over
    // both a fresh id and the cached one.
    const sdp = parse(SINGLE_PC_OFFER);
    sectionOf(sdp.media, '0').ext!.push({ value: 13, uri: ddExtensionURI });

    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 0)).toBe(13);
    expect(ensureVideoDDExtension(sectionOf(sdp.media, '2'), sdp, 7)).toBe(13);
    expect(ddOf(sdp.media, '1')).toBe(13);
    expect(ddOf(sdp.media, '2')).toBe(13);
  });

  it('steps over the id RFC 8285 reserves', () => {
    const sdp = parse(SINGLE_PC_OFFER);
    sectionOf(sdp.media, '0').ext!.push({ value: 14, uri: 'urn:3gpp:video-orientation' });

    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 0)).toBe(16);
  });

  it('abandons the cached id once something else stands for it', () => {
    // The id was free when it was picked, then the first section we send on brought the fuller
    // extension set along and claimed it. Reusing it anyway is what makes the browser reject
    // the offer with "a BUNDLE group contains a codec collision for header extension id".
    const sdp = parse(SINGLE_PC_OFFER);
    sectionOf(sdp.media, '0').ext!.push({ value: 12, uri: 'urn:3gpp:video-orientation' });

    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 12)).toBe(13);
    expect(ddOf(sdp.media, '1')).toBe(13);
  });

  it('leaves the offer alone when the mapped id is contested', () => {
    // Nothing consistent for the whole bundle is available: the extension is mapped to 12 on one
    // section and 12 means something else on another, and the browser's half of the map is not
    // ours to renumber. Losing AV1 beats an offer that cannot be applied at all.
    const sdp = parse(SINGLE_PC_OFFER);
    sectionOf(sdp.media, '0').ext!.push({ value: 12, uri: 'urn:3gpp:video-orientation' });
    sectionOf(sdp.media, '2').ext!.push({ value: 12, uri: ddExtensionURI });

    expect(ensureVideoDDExtension(sectionOf(sdp.media, '1'), sdp, 0)).toBe(0);
    expect(ddOf(sdp.media, '1')).toBeUndefined();
  });

  it('adds the extension to a section that has none', () => {
    const sdp = parse(SINGLE_PC_OFFER);
    const section = sectionOf(sdp.media, '1');
    delete section.ext;
    expect(ensureVideoDDExtension(section, sdp, 0)).toBe(12);
    expect(ddOf(sdp.media, '1')).toBe(12);
  });
});

describe('isDuplicateAnswer', () => {
  it('drops an answer while the same offer is still being answered', () => {
    expect(isDuplicateAnswer(3, 3, 0, 'have-local-offer', false)).toBe(true);
  });

  it('drops a repeat of an unnumbered answer while the first is still applying', () => {
    expect(isDuplicateAnswer(0, 0, 0, 'have-local-offer', false)).toBe(true);
  });

  it('drops an answer for an offer whose answer was already applied', () => {
    expect(isDuplicateAnswer(3, undefined, 3, 'stable', false)).toBe(true);
  });

  it('accepts a retry after a failed apply: nothing in flight, nothing applied', () => {
    expect(isDuplicateAnswer(3, undefined, 2, 'have-local-offer', false)).toBe(false);
  });

  it('accepts the answer for a new offer', () => {
    expect(isDuplicateAnswer(4, undefined, 3, 'have-local-offer', false)).toBe(false);
  });

  it('without an offerId, drops an answer in stable', () => {
    expect(isDuplicateAnswer(0, undefined, 0, 'stable', false)).toBe(true);
  });

  it('without an offerId, accepts the answer to a deferred initial offer', () => {
    expect(isDuplicateAnswer(0, undefined, 0, 'stable', true)).toBe(false);
  });
});
