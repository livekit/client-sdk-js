import { describe, expect, it } from 'vitest';
import { createRtcUrl, createValidateUrl } from './utils';

describe('createRtcUrl', () => {
  it('should create a basic RTC URL', () => {
    const url = 'wss://example.com';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('wss://example.com/rtc');
  });

  it('should handle search parameters', () => {
    const url = 'wss://example.com';
    const searchParams = new URLSearchParams({
      token: 'test-token',
      room: 'test-room',
    });
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('wss://example.com/rtc?token=test-token&room=test-room');
  });

  it('should handle ws protocol', () => {
    const url = 'ws://example.com';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('ws://example.com/rtc');
  });

  it('should handle sub paths', () => {
    const url = 'wss://example.com/sub/path';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('wss://example.com/sub/path/rtc');
  });

  it('should handle sub paths with trailing slashes', () => {
    const url = 'wss://example.com/sub/path/';
    const searchParams = new URLSearchParams();
    const result = createRtcUrl(url, searchParams);
    expect(result.toString()).toBe('wss://example.com/sub/path/rtc');
  });
});

describe('createValidateUrl', () => {
  it('should create a basic validate URL', () => {
    const rtcUrl = createRtcUrl('wss://example.com', new URLSearchParams());
    const result = createValidateUrl(rtcUrl);
    expect(result.toString()).toBe('https://example.com/rtc/validate');
  });

  it('should handle search parameters', () => {
    const rtcUrl = createRtcUrl(
      'wss://example.com',
      new URLSearchParams({
        token: 'test-token',
        room: 'test-room',
      }),
    );
    const result = createValidateUrl(rtcUrl);
    expect(result.toString()).toBe(
      'https://example.com/rtc/validate?token=test-token&room=test-room',
    );
  });

  it('should handle ws protocol', () => {
    const rtcUrl = createRtcUrl('ws://example.com', new URLSearchParams());
    const result = createValidateUrl(rtcUrl);
    expect(result.toString()).toBe('http://example.com/rtc/validate');
  });

  it('should preserve the original path', () => {
    const rtcUrl = createRtcUrl('wss://example.com/rtc/some/path', new URLSearchParams());
    const result = createValidateUrl(rtcUrl);
    expect(result.toString()).toBe('https://example.com/rtc/some/path/validate');
  });

  it('should handle sub paths with trailing slashes', () => {
    const rtcUrl = createRtcUrl('wss://example.com/sub/path/', new URLSearchParams());
    const result = createValidateUrl(rtcUrl);
    expect(result.toString()).toBe('https://example.com/sub/path/validate');
  });
});
