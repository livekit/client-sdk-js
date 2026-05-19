import { ClientInfo_Capability } from '@livekit/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractMaxAgeFromRequestHeaders,
  getClientInfo,
  shouldUsePrejoinPublisherOffer,
  splitUtf8,
  toWebsocketUrl,
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

describe('getClientInfo', () => {
  it('does not advertise packet trailer capability by default', () => {
    expect(getClientInfo().capabilities).toEqual([]);
  });

  it('advertises packet trailer capability when provided', () => {
    expect(getClientInfo([ClientInfo_Capability.CAP_PACKET_TRAILER]).capabilities).toEqual([
      ClientInfo_Capability.CAP_PACKET_TRAILER,
    ]);
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

// Regression coverage for #1919: Firefox cannot connect after upgrading from
// 2.18.0 to 2.18.1 because the publisher data channel never opens when the
// initial offer is created before setLocalDescription. The fast-publisher-offer
// path must therefore be skipped on Firefox.
describe('shouldUsePrejoinPublisherOffer', () => {
  const originalUserAgent = navigator.userAgent;
  const originalCompressionStream = (globalThis as unknown as { CompressionStream?: unknown })
    .CompressionStream;

  function setUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: ua,
    });
  }

  function setCompressionStreamSupported(supported: boolean) {
    if (supported) {
      Object.defineProperty(globalThis, 'CompressionStream', {
        configurable: true,
        value: class CompressionStreamStub {},
        writable: true,
      });
    } else {
      // Removing the global is the most faithful way to model older browsers.
      delete (globalThis as unknown as { CompressionStream?: unknown }).CompressionStream;
    }
  }

  beforeEach(() => {
    // happy-dom ships CompressionStream by default; pin known state per test.
    setCompressionStreamSupported(true);
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
    if (typeof originalCompressionStream === 'undefined') {
      delete (globalThis as unknown as { CompressionStream?: unknown }).CompressionStream;
    } else {
      Object.defineProperty(globalThis, 'CompressionStream', {
        configurable: true,
        value: originalCompressionStream,
        writable: true,
      });
    }
  });

  it('is false on Firefox even when CompressionStream is supported (#1919)', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0');
    expect(shouldUsePrejoinPublisherOffer(false)).toBe(false);
  });

  it('is true on Chrome when CompressionStream is supported', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    expect(shouldUsePrejoinPublisherOffer(false)).toBe(true);
  });

  it('is true on Safari (desktop) when CompressionStream is supported', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    expect(shouldUsePrejoinPublisherOffer(false)).toBe(true);
  });

  it('is false on any browser when CompressionStream is not supported', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    setCompressionStreamSupported(false);
    expect(shouldUsePrejoinPublisherOffer(false)).toBe(false);
  });

  it('is false when useV0Path is true (legacy dual peer connection path)', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    expect(shouldUsePrejoinPublisherOffer(true)).toBe(false);
  });

  it('is false when useV0Path is true on Firefox too', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0');
    expect(shouldUsePrejoinPublisherOffer(true)).toBe(false);
  });

  it('is true on Firefox-on-iOS (FxiOS) only if CompressionStream is present — FxiOS uses WebKit, not Gecko, so the Firefox SCTP timing quirk does not apply, and the browser parser reports name=Firefox os=iOS. We intentionally keep this conservative and still bypass for any Firefox UA.', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
    );
    // FxiOS still gets detected as Firefox by the parser; we keep it conservative.
    expect(shouldUsePrejoinPublisherOffer(false)).toBe(false);
  });
});
