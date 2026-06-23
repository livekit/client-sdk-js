import { DataPacket, DataPacket_Kind, UserPacket } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RTCEngine, { DataChannelKind } from './RTCEngine';
import { roomOptionDefaults } from './defaults';
import { PublishDataError } from './errors';

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

  function setupFrameMetadataSender(engine: RTCEngine, sender: RTCRtpSender, opts = {}) {
    (
      engine as unknown as {
        setupFrameMetadataSender: (sender: RTCRtpSender, opts?: unknown) => void;
      }
    ).setupFrameMetadataSender(sender, opts);
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

    setupFrameMetadataSender(engine, sender);

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

    setupFrameMetadataSender(engine, sender);

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

    setupFrameMetadataSender(engine, sender, { packetTrailer: { timestamp: true, frameId: true } });

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
    const RTCRtpScriptTransform = vi.fn(function () {
      return transform;
    });
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

    setupFrameMetadataSender(engine, sender, { packetTrailer: { timestamp: true } });

    expect(RTCRtpScriptTransform).toHaveBeenCalledWith(worker, {
      kind: 'encode',
      packetTrailer: { timestamp: true },
    });
    expect((sender as unknown as { transform: unknown }).transform).toBe(transform);
    expect(createEncodedStreams).not.toHaveBeenCalled();
  });

  describe('sendDataPacket', () => {
    const MAX_DATA_PACKET_SIZE = 64 * 1024 - 1; // 65535 bytes (64 KB - 1)
    function stubConnectedEngine(
      engine: RTCEngine,
      maxDataPacketSize: number = MAX_DATA_PACKET_SIZE,
    ) {
      const send = vi.fn();
      Object.assign(engine as unknown as Record<string, unknown>, {
        ensurePublisherConnected: vi.fn().mockResolvedValue(undefined),
        waitForBufferStatusLow: vi.fn().mockResolvedValue(undefined),
        updateAndEmitDCBufferStatus: vi.fn(),
        dataChannelForKind: vi.fn(() => ({ send })),
        pcManager: {
          getMaxPublisherMessageSize: vi.fn(() => maxDataPacketSize),
        },
      });
      return send;
    }

    it('rejects packets larger than the max data packet size', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const send = stubConnectedEngine(engine);

      // The serialized packet includes protobuf framing on top of the payload, so a payload at the
      // limit is already guaranteed to exceed it once serialized.
      const packet = new DataPacket({
        kind: DataPacket_Kind.RELIABLE,
        value: {
          case: 'user',
          value: new UserPacket({ payload: new Uint8Array(MAX_DATA_PACKET_SIZE) }),
        },
      });

      await expect(engine.sendDataPacket(packet, DataChannelKind.RELIABLE)).rejects.toBeInstanceOf(
        PublishDataError,
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('does not reject packets if the max data packet size is 0', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const send = stubConnectedEngine(engine, 0);

      const packet = new DataPacket({
        kind: DataPacket_Kind.RELIABLE,
        value: {
          case: 'user',
          value: new UserPacket({ payload: new Uint8Array(100) }),
        },
      });

      // Sending the packet should succeed, there isn't a size limit
      await expect(
        engine.sendDataPacket(packet, DataChannelKind.RELIABLE),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends packets within the max data packet size', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const send = stubConnectedEngine(engine);

      const packet = new DataPacket({
        kind: DataPacket_Kind.RELIABLE,
        value: {
          case: 'user',
          value: new UserPacket({ payload: new Uint8Array(1024) }),
        },
      });

      await expect(
        engine.sendDataPacket(packet, DataChannelKind.RELIABLE),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleDataChannelClose', () => {
    function stubCloseEnv(
      engine: RTCEngine,
      { closed, publisherState }: { closed: boolean; publisherState: RTCPeerConnectionState },
    ) {
      const error = vi.fn();
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: closed,
        log: { error },
        pcManager: {
          publisher: { getConnectionState: () => publisherState },
        },
      });
      return error;
    }

    function fireClose(engine: RTCEngine, kind: DataChannelKind) {
      (
        engine as unknown as {
          handleDataChannelClose: (kind: DataChannelKind) => () => void;
        }
      ).handleDataChannelClose(kind)();
    }

    it('logs an error when a publisher channel closes while connected', () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const error = stubCloseEnv(engine, { closed: false, publisherState: 'connected' });

      fireClose(engine, DataChannelKind.RELIABLE);

      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toContain('RELIABLE');
    });

    it('stays quiet when the engine is already closed', () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const error = stubCloseEnv(engine, { closed: true, publisherState: 'connected' });

      fireClose(engine, DataChannelKind.RELIABLE);

      expect(error).not.toHaveBeenCalled();
    });

    it('stays quiet when the publisher PC is no longer connected', () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const error = stubCloseEnv(engine, { closed: false, publisherState: 'closed' });

      fireClose(engine, DataChannelKind.RELIABLE);

      expect(error).not.toHaveBeenCalled();
    });
  });
});
