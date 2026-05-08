import { afterEach, describe, expect, it, vi } from 'vitest';
import RTCEngine from './RTCEngine';
import { roomOptionDefaults } from './defaults';

describe('RTCEngine', () => {
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

  function stubScriptTransformSupport() {
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: class MockRTCRtpScriptTransform {},
      writable: true,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
  }

  function makeRTCConfiguration(engine: RTCEngine) {
    return (
      engine as unknown as { makeRTCConfiguration: () => RTCConfiguration }
    ).makeRTCConfiguration();
  }

  function setupPacketTrailerSender(engine: RTCEngine, sender: RTCRtpSender, opts = {}) {
    (
      engine as unknown as {
        setupPacketTrailerSender: (sender: RTCRtpSender, opts?: unknown) => void;
      }
    ).setupPacketTrailerSender(sender, opts);
  }

  it('does not enable encoded insertable streams without E2EE or a packet trailer worker', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine(roomOptionDefaults);

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBeUndefined();
  });

  it('enables encoded insertable streams when a packet trailer worker is configured', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker: {} as Worker },
    });

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBe(true);
  });

  it('does not enable encoded insertable streams for packet trailers when script transforms are supported', () => {
    stubInsertableStreamsSupport();
    stubScriptTransformSupport();

    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker: {} as Worker },
    });

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBeUndefined();
  });

  it('enables encoded insertable streams for E2EE', () => {
    stubInsertableStreamsSupport();

    const engine = new RTCEngine(roomOptionDefaults);
    (
      engine as unknown as {
        signalOpts: {
          autoSubscribe: boolean;
          maxRetries: number;
          e2eeEnabled: boolean;
          websocketTimeout: number;
        };
      }
    ).signalOpts = {
      autoSubscribe: true,
      maxRetries: 1,
      e2eeEnabled: true,
      websocketTimeout: 15_000,
    };

    expect(makeRTCConfiguration(engine).encodedInsertableStreams).toBe(true);
  });

  it('does not create sender encoded streams when packetTrailer has no worker', () => {
    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: {} as never,
    });
    const createEncodedStreams = vi.fn();
    const sender = {
      createEncodedStreams,
    } as unknown as RTCRtpSender;

    setupPacketTrailerSender(engine, sender);

    expect(createEncodedStreams).not.toHaveBeenCalled();
  });

  it('does not create sender passthrough streams for packet trailers when script transforms are supported', () => {
    stubScriptTransformSupport();

    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker: {} as Worker },
    });
    const createEncodedStreams = vi.fn();
    const sender = {
      createEncodedStreams,
    } as unknown as RTCRtpSender;

    setupPacketTrailerSender(engine, sender);

    expect(createEncodedStreams).not.toHaveBeenCalled();
  });

  it('posts sender encode streams to the packet trailer worker when write features are enabled', () => {
    stubInsertableStreamsSupport();

    const worker = { postMessage: vi.fn() } as unknown as Worker;
    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker },
    });
    const readable = {} as ReadableStream;
    const writable = {} as WritableStream;
    const createEncodedStreams = vi.fn(() => ({ readable, writable }));
    const sender = {
      createEncodedStreams,
    } as unknown as RTCRtpSender;

    setupPacketTrailerSender(engine, sender, { packetTrailer: { timestamp: true, frameId: true } });

    expect(createEncodedStreams).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        kind: 'encode',
        data: {
          readableStream: readable,
          writableStream: writable,
          packetTrailer: { timestamp: true, frameId: true },
        },
      },
      [readable, writable],
    );
  });

  it('uses RTCRtpScriptTransform for sender packet trailer writes when supported', () => {
    stubScriptTransformSupport();

    const transform = {};
    const RTCRtpScriptTransform = vi.fn(() => transform);
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: RTCRtpScriptTransform,
      writable: true,
    });
    Object.defineProperty(globalThis, 'RTCRtpScriptTransform', {
      configurable: true,
      value: RTCRtpScriptTransform,
      writable: true,
    });

    const worker = {} as Worker;
    const engine = new RTCEngine({
      ...roomOptionDefaults,
      packetTrailer: { worker },
    });
    const createEncodedStreams = vi.fn();
    const sender = {
      createEncodedStreams,
    } as unknown as RTCRtpSender;

    setupPacketTrailerSender(engine, sender, { packetTrailer: { timestamp: true } });

    expect(RTCRtpScriptTransform).toHaveBeenCalledWith(worker, {
      kind: 'encode',
      packetTrailer: { timestamp: true },
    });
    expect((sender as unknown as { transform: unknown }).transform).toBe(transform);
    expect(createEncodedStreams).not.toHaveBeenCalled();
  });
});
