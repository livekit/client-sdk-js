import { PacketTrailerFeature } from '@livekit/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getPacketTrailerFeatures,
  getPacketTrailerPublishOptions,
  isPacketTrailerSupported,
} from './utils';

describe('packet trailer support', () => {
  const originalRTCRtpSender = window.RTCRtpSender;
  const originalRTCRtpScriptTransform = (window as unknown as { RTCRtpScriptTransform?: unknown })
    .RTCRtpScriptTransform;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: originalRTCRtpSender,
      writable: true,
    });
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: originalRTCRtpScriptTransform,
      writable: true,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  function stubScriptTransformSupport(userAgent: string) {
    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: class MockRTCRtpScriptTransform {},
      writable: true,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: userAgent,
    });
  }

  it('supports packet trailers with RTCRtpScriptTransform on Safari', () => {
    stubScriptTransformSupport(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );

    expect(isPacketTrailerSupported({ worker: {} as Worker })).toBe(true);
  });

  it('supports packet trailers with RTCRtpScriptTransform on Firefox', () => {
    stubScriptTransformSupport(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:144.0) Gecko/20100101 Firefox/144.0',
    );

    expect(isPacketTrailerSupported({ worker: {} as Worker })).toBe(true);
  });

  it('does not use RTCRtpScriptTransform support on Chromium-based browsers', () => {
    stubScriptTransformSupport(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    );

    expect(isPacketTrailerSupported({ worker: {} as Worker })).toBe(false);
  });
});

describe('packet trailer publish features', () => {
  it('maps publish options to protocol features', () => {
    expect(getPacketTrailerFeatures({ timestamp: true, frameId: true })).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(getPacketTrailerFeatures({ timestamp: true })).toEqual([
      PacketTrailerFeature.PTF_USER_TIMESTAMP,
    ]);
    expect(getPacketTrailerFeatures({ frameId: true })).toEqual([
      PacketTrailerFeature.PTF_FRAME_ID,
    ]);
    expect(getPacketTrailerFeatures()).toEqual([]);
  });

  it('maps protocol features to publish options', () => {
    expect(
      getPacketTrailerPublishOptions([
        PacketTrailerFeature.PTF_USER_TIMESTAMP,
        PacketTrailerFeature.PTF_FRAME_ID,
      ]),
    ).toEqual({ timestamp: true, frameId: true });
    expect(getPacketTrailerPublishOptions([PacketTrailerFeature.PTF_USER_TIMESTAMP])).toEqual({
      timestamp: true,
    });
    expect(getPacketTrailerPublishOptions([PacketTrailerFeature.PTF_FRAME_ID])).toEqual({
      frameId: true,
    });
    expect(getPacketTrailerPublishOptions()).toBeUndefined();
    expect(getPacketTrailerPublishOptions([])).toBeUndefined();
  });
});
