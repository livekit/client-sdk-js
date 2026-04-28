import { afterEach, describe, expect, it, vi } from 'vitest';
import { PacketTrailerManager } from './PacketTrailerManager';

describe('PacketTrailerManager', () => {
  const originalUserAgent = navigator.userAgent;
  const originalRTCRtpScriptTransform = (window as unknown as { RTCRtpScriptTransform?: unknown })
    .RTCRtpScriptTransform;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: originalRTCRtpScriptTransform,
      writable: true,
    });
    Object.defineProperty(globalThis, 'RTCRtpScriptTransform', {
      configurable: true,
      value: originalRTCRtpScriptTransform,
      writable: true,
    });
  });

  function useSafariUserAgent() {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
  }

  function setScriptTransform(mock: unknown) {
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: mock,
      writable: true,
    });
    Object.defineProperty(globalThis, 'RTCRtpScriptTransform', {
      configurable: true,
      value: mock,
      writable: true,
    });
  }

  function setupWorkerReceiver(manager: PacketTrailerManager, receiver: RTCRtpReceiver) {
    (
      manager as unknown as {
        setupWorkerReceiver: (receiver: RTCRtpReceiver, newTrackId: string) => void;
      }
    ).setupWorkerReceiver(receiver, 'track-id');
  }

  it('uses RTCRtpScriptTransform for packet trailer extraction when supported', () => {
    useSafariUserAgent();
    const transform = {};
    const RTCRtpScriptTransform = vi.fn(() => transform);
    setScriptTransform(RTCRtpScriptTransform);

    const worker = {} as Worker;
    const manager = new PacketTrailerManager({ worker });
    const receiver = {
      createEncodedStreams: vi.fn(),
    } as unknown as RTCRtpReceiver;

    setupWorkerReceiver(manager, receiver);

    expect(RTCRtpScriptTransform).toHaveBeenCalledWith(worker, {
      kind: 'decode',
      trackId: 'track-id',
    });
    expect((receiver as unknown as { transform: unknown }).transform).toBe(transform);
    expect(
      (receiver as unknown as { createEncodedStreams: ReturnType<typeof vi.fn> })
        .createEncodedStreams,
    ).not.toHaveBeenCalled();
  });
});
