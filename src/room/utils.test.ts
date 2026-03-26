import { describe, expect, it } from 'vitest';
import {
  extractMaxAgeFromRequestHeaders,
  splitUtf8,
  toWebsocketUrl,
  isSafariSpeakerSelectionSupported,
  supportsSetSinkId,
} from './utils';

describe('toWebsocketUrl', () => {
  it('leaves wss urls alone', () => {
    expect(toWebsocketUrl('ws://mywebsite.com')).toEqual('ws://mywebsite.com');
  });

  it('converts https to wss', () => {
    expect(toWebsocketUrl('https://mywebsite.com')).toEqual('wss://mywebsite.com');
  });

  it('does not convert other parts of URL', () => {
    expect(toWebsocketUrl('https://httpsmywebsite.com')).toEqual('wss://httpsmywebsite.com');
  });
});

describe('splitUtf8', () => {
  it('splits a string into chunks of the given size', () => {
    expect(splitUtf8('hello world', 5)).toEqual([
      new TextEncoder().encode('hello'),
      new TextEncoder().encode(' worl'),
      new TextEncoder().encode('d'),
    ]);
  });

  it('splits a string with special characters into chunks of the given size', () => {
    expect(splitUtf8('héllo wörld', 5)).toEqual([
      new TextEncoder().encode('héll'),
      new TextEncoder().encode('o wö'),
      new TextEncoder().encode('rld'),
    ]);
  });

  it('splits a string with multi-byte utf8 characters correctly', () => {
    expect(splitUtf8('こんにちは世界', 5)).toEqual([
      new TextEncoder().encode('こ'),
      new TextEncoder().encode('ん'),
      new TextEncoder().encode('に'),
      new TextEncoder().encode('ち'),
      new TextEncoder().encode('は'),
      new TextEncoder().encode('世'),
      new TextEncoder().encode('界'),
    ]);
  });

  it('handles a string with a single multi-byte utf8 character', () => {
    expect(splitUtf8('😊', 5)).toEqual([new TextEncoder().encode('😊')]);
  });

  it('handles a string with mixed single and multi-byte utf8 characters', () => {
    expect(splitUtf8('a😊b', 4)).toEqual([
      new TextEncoder().encode('a'),
      new TextEncoder().encode('😊'),
      new TextEncoder().encode('b'),
    ]);
  });

  it('handles an empty string', () => {
    expect(splitUtf8('', 5)).toEqual([]);
  });
});

describe('extractMaxAgeFromRequestHeaders', () => {
  it('extracts max-age from valid Cache-Control header', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=3600');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(3600);
  });

  it('extracts max-age from Cache-Control header with multiple directives', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=7200, must-revalidate');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(7200);
  });

  it('extracts max-age when it appears at the beginning', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=1800, public, no-cache');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(1800);
  });

  it('extracts max-age when it appears in the middle', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=900, no-store');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(900);
  });

  it('handles max-age with value 0', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=0');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(0);
  });

  it('handles large max-age values', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=31536000'); // 1 year
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(31536000);
  });

  it('returns undefined when Cache-Control header is missing', () => {
    const headers = new Headers();
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when Cache-Control header exists but has no max-age', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'public, no-cache, must-revalidate');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when Cache-Control header is empty', () => {
    const headers = new Headers();
    headers.set('Cache-Control', '');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('handles Cache-Control header with extra whitespace', () => {
    const headers = new Headers();
    headers.set('Cache-Control', '  public,  max-age=1200  , no-cache  ');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(1200);
  });

  it('returns undefined for malformed max-age values', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=abc, public');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('handles max-age with leading zeros', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=0003600');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(3600);
  });

  it('takes the first max-age value when multiple are present', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=1800, public, max-age=3600');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(1800);
  });

  it('handles case-insensitive Cache-Control header name', () => {
    const headers = new Headers();
    headers.set('cache-control', 'max-age=2400');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(2400);
  });

  it('handles Cache-Control with s-maxage (should ignore s-maxage)', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 's-maxage=1800, max-age=3600');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(3600);
  });

  it('returns undefined when only s-maxage is present (no max-age)', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 's-maxage=1800, public');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('returns undefined for negative max-age values (regex only matches positive digits)', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'max-age=-100');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('ignores non standard cache control custom-max-age values', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'custom-max-age=7200');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBeUndefined();
  });

  it('still works with comma separated non standard cache control custom-max-age values', () => {
    const headers = new Headers();
    headers.set('Cache-Control', 'custom-max-age=7200,max-age=3600');
    expect(extractMaxAgeFromRequestHeaders(headers)).toBe(3600);
  });
});

describe('isSafariSpeakerSelectionSupported', () => {
  it('returns true for Safari >= 26 on macOS', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '26.0',
      os: 'macOS',
      osVersion: '15.0',
    })).toBe(true);
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '27.1',
      os: 'macOS',
      osVersion: '15.1',
    })).toBe(true);
  });

  it('returns true for Safari >= 26 on iOS', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '26.0',
      os: 'iOS',
      osVersion: '19.0',
    })).toBe(true);
  });

  it('returns false for Safari < 26', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '25.9',
      os: 'macOS',
      osVersion: '15.0',
    })).toBe(false);
  });

  it('returns false for non-Safari browsers', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Chrome',
      version: '120.0',
      os: 'macOS',
      osVersion: '15.0',
    })).toBe(false);
    expect(isSafariSpeakerSelectionSupported({
      name: 'Chrome',
      version: '120.0',
      os: 'iOS',
      osVersion: '19.0',
    })).toBe(false);
  });

  it('returns false when browser is undefined', () => {
    expect(isSafariSpeakerSelectionSupported(undefined)).toBe(false);
  });
});

describe('supportsSetSinkId', () => {
  it('returns true if setSinkId is present', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0',
      configurable: true,
    });
    const fakeAudio = { setSinkId: () => {} } as any as HTMLMediaElement;
    expect(supportsSetSinkId(fakeAudio)).toBe(true);
  });
  it('returns true if setSinkId is present', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      configurable: true,
    });
    const fakeAudio = { setSinkId: () => {} } as any as HTMLMediaElement;
    expect(supportsSetSinkId(fakeAudio)).toBe(true);
  });
  it('returns false if setSinkId not supported', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      configurable: true,
    });
    const fakeAudio = { setSinkId: () => {} } as any as HTMLMediaElement;
    expect(supportsSetSinkId(fakeAudio)).toBe(false);
  });
});
