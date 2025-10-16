import { describe, expect, it } from 'vitest';
import { splitUtf8, toWebsocketUrl } from './utils';
import { isSafariSpeakerSelectionSupported, supportsSetSinkId } from './utils';


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

describe('isSafariSpeakerSelectionSupported', () => {
  it('returns true for Safari >= 26', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '26.0',
      os: 'macOS',
      osVersion: '26.0',
    })).toBe(true);
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '27.1',
      os: 'macOS',
      osVersion: '27.1',
    })).toBe(true);
  });

  it('returns true for iOS Safari >= 26', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '26.0',
      os: 'iOS',
      osVersion: '26.0',
    })).toBe(true);
  });

  it('returns false for Safari < 26', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Safari',
      version: '25.9',
      os: 'macOS',
      osVersion: '25.9',
    })).toBe(false);
  });

  it('returns false for non-Safari browsers', () => {
    expect(isSafariSpeakerSelectionSupported({
      name: 'Chrome',
      version: '120.0',
      os: 'macOS',
      osVersion: '14.0',
    })).toBe(false);
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