import { describe, expect, it } from 'vitest';
import { createRtcUrl, createValidateUrl } from './utils';

describe('createRtcUrl', () => {
  it('should create a basic RTC URL', () => {
    const url = 'wss://example.com';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('wss://example.com/rtc/v1');
  });

  it('should create a basic RTC URL with http protocol', () => {
    const url = 'http://example.com';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('ws://example.com/rtc/v1');
  });

  it('should handle search parameters', () => {
    const url = 'wss://example.com';
    const searchParams = new URLSearchParams({
      token: 'test-token',
      room: 'test-room',
    });
    const result = createRtcUrl(url, searchParams);

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/rtc/v1');
    expect(parsedResult.searchParams.get('token')).toBe('test-token');
    expect(parsedResult.searchParams.get('room')).toBe('test-room');
  });

  it('should handle ws protocol', () => {
    const url = 'ws://example.com';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/rtc/v1');
  });

  it('should handle sub paths', () => {
    const url = 'wss://example.com/sub/path';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/sub/path/rtc/v1');
  });

  it('should handle sub paths with trailing slashes', () => {
    const url = 'wss://example.com/sub/path/';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/sub/path/rtc/v1');
  });

  it('should handle sub paths with url params', () => {
    const url = 'wss://example.com/sub/path?param=value';
    const searchParams = new URLSearchParams();
    searchParams.set('token', 'test-token');
    const result = createRtcUrl(url, searchParams);

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/sub/path/rtc/v1');
    expect(parsedResult.searchParams.get('param')).toBe('value');
    expect(parsedResult.searchParams.get('token')).toBe('test-token');
  });
});

describe('createValidateUrl', () => {
  it('should create a basic validate URL', () => {
    const rtcUrl = createRtcUrl('wss://example.com', new URLSearchParams());
    const result = createValidateUrl(rtcUrl.toString());
    expect(result.toString()).toBe('https://example.com/rtc/v1/validate');
  });

  it('should handle search parameters', () => {
    const rtcUrl = createRtcUrl(
      'wss://example.com',
      new URLSearchParams({
        token: 'test-token',
        room: 'test-room',
      }),
    );
    const result = createValidateUrl(rtcUrl.toString());

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/rtc/v1/validate');
    expect(parsedResult.searchParams.get('token')).toBe('test-token');
    expect(parsedResult.searchParams.get('room')).toBe('test-room');
  });

  it('should handle ws protocol', () => {
    const rtcUrl = createRtcUrl('ws://example.com', new URLSearchParams());
    const result = createValidateUrl(rtcUrl.toString());

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/rtc/v1/validate');
  });

  it('should preserve the original path', () => {
    const rtcUrl = createRtcUrl('wss://example.com/some/path', new URLSearchParams());
    const result = createValidateUrl(rtcUrl.toString());

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/some/path/rtc/v1/validate');
  });

  it('should handle sub paths with trailing slashes', () => {
    const rtcUrl = createRtcUrl('wss://example.com/sub/path/', new URLSearchParams());
    const result = createValidateUrl(rtcUrl.toString());

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/sub/path/rtc/v1/validate');
  });

  it('should handle v0 paths', () => {
    const rtcUrl = createRtcUrl('wss://example.com/sub/path/', new URLSearchParams(), true);
    const result = createValidateUrl(rtcUrl.toString());

    const parsedResult = new URL(result);
    expect(parsedResult.pathname).toBe('/sub/path/rtc/validate');
  });
});
