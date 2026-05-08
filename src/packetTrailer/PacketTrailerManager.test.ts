import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackInfo } from '@livekit/protocol';
import { PacketTrailerManager } from './PacketTrailerManager';

describe('PacketTrailerManager', () => {
  const originalRTCRtpSender = window.RTCRtpSender;
  const originalUserAgent = navigator.userAgent;
  const originalRTCRtpScriptTransform = (window as unknown as { RTCRtpScriptTransform?: unknown })
    .RTCRtpScriptTransform;

  afterEach(() => {
    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: originalRTCRtpSender,
      writable: true,
    });
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

  function stubInsertableStreamsSupport() {
    class MockRTCRtpSender {
      createEncodedStreams() {}
    }

    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: MockRTCRtpSender,
      writable: true,
    });
  }

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

  function setupReceiver(
    manager: PacketTrailerManager,
    receiver: RTCRtpReceiver,
    trackId: string,
    trackInfo?: TrackInfo,
  ) {
    (
      manager as unknown as {
        setupReceiver: (
          track: { receiver: RTCRtpReceiver; mediaStreamID: string },
          trackInfo?: TrackInfo,
        ) => void;
      }
    ).setupReceiver({ receiver, mediaStreamID: trackId }, trackInfo);
  }

  function makeReceiver() {
    const readable = {} as ReadableStream;
    const writable = {} as WritableStream;
    const createEncodedStreams = vi.fn(() => ({ readable, writable }));

    return {
      receiver: { createEncodedStreams } as unknown as RTCRtpReceiver,
      readable,
      writable,
      createEncodedStreams,
    };
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

  it('sets up a passthrough receiver pipeline when a subscribed track has no packet trailer features', () => {
    stubInsertableStreamsSupport();

    const worker = { postMessage: vi.fn() } as unknown as Worker;
    const manager = new PacketTrailerManager({ worker });
    const { receiver, readable, writable, createEncodedStreams } = makeReceiver();

    setupReceiver(manager, receiver, 'track-without-trailer');

    expect(createEncodedStreams).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        kind: 'decode',
        data: {
          readableStream: readable,
          writableStream: writable,
          trackId: 'track-without-trailer',
          hasPacketTrailer: false,
        },
      },
      [readable, writable],
    );
  });

  it('updates a reused receiver from trailer extraction to passthrough for tracks without packet trailer features', () => {
    stubInsertableStreamsSupport();

    const worker = { postMessage: vi.fn() } as unknown as Worker;
    const manager = new PacketTrailerManager({ worker });
    const { receiver } = makeReceiver();
    const trackInfo = { packetTrailerFeatures: [1] } as unknown as TrackInfo;

    setupReceiver(manager, receiver, 'track-with-trailer', trackInfo);
    setupReceiver(manager, receiver, 'track-without-trailer');

    expect(worker.postMessage).toHaveBeenLastCalledWith({
      kind: 'updateTrackId',
      data: {
        oldTrackId: 'track-with-trailer',
        newTrackId: 'track-without-trailer',
        hasPacketTrailer: false,
      },
    });
  });
});
