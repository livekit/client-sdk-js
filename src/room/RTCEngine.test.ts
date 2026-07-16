import { DataPacket, DataPacket_Kind, UserPacket } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataPacketBuffer, DataPacketItem } from '../utils/dataPacketBuffer';
import RTCEngine, { DataChannelKind } from './RTCEngine';
import { roomOptionDefaults } from './defaults';
import { PublishDataError, UnexpectedConnectionState } from './errors';

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
        waitForBufferHeadroom: vi.fn().mockResolvedValue(undefined),
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

  class FakeDataChannel extends EventTarget {
    bufferedAmount = 0;

    bufferedAmountLowThreshold = 64 * 1024;

    send = vi.fn();
  }

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  describe('resendReliableMessagesForResume', () => {
    it('does not let a concurrent reliable send interleave into the resume replay', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        ensurePublisherConnected: vi.fn().mockResolvedValue(undefined),
        dataChannelForKind: vi.fn(() => dc),
        pcManager: {
          getMaxPublisherMessageSize: vi.fn(() => 64 * 1024 - 1),
        },
      });

      // Two messages queued for replay, and a full buffer so the replay parks on
      // waitForBufferHeadroom before its first send.
      const replayed1 = new Uint8Array([1]);
      const replayed2 = new Uint8Array([2]);
      const buffer = (
        engine as unknown as { reliableMessageBuffer: { push: (item: DataPacketItem) => void } }
      ).reliableMessageBuffer;
      buffer.push({ data: replayed1, sequence: 1, sent: true });
      buffer.push({ data: replayed2, sequence: 2, sent: true });
      dc.bufferedAmount = 2 * 1024 * 1024; // above the reliable high-water mark

      const replay = (
        engine as unknown as { resendReliableMessagesForResume: (seq: number) => Promise<void> }
      ).resendReliableMessagesForResume(0);
      await tick();

      // A send racing the replay: its sequence is assigned immediately, but it must not hit the
      // wire before the replayed (lower-sequence) messages, or receivers discard those as dupes.
      const concurrentSend = engine.sendDataPacket(
        new DataPacket({
          kind: DataPacket_Kind.RELIABLE,
          value: { case: 'user', value: new UserPacket({ payload: new Uint8Array([3]) }) },
        }),
        DataChannelKind.RELIABLE,
      );
      await tick();

      // Buffer drains: the replay must finish its whole batch before the concurrent send.
      dc.bufferedAmount = 0;
      dc.dispatchEvent(new Event('bufferedamountlow'));
      await Promise.all([replay, concurrentSend]);

      expect(dc.send).toHaveBeenCalledTimes(3);
      expect(dc.send.mock.calls[0][0]).toBe(replayed1);
      expect(dc.send.mock.calls[1][0]).toBe(replayed2);
      expect(dc.send.mock.calls[2][0]).not.toBe(replayed1);
      expect(dc.send.mock.calls[2][0]).not.toBe(replayed2);
    });

    it('transmits a packet deferred mid-replay instead of marking it sent without sending', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        // Reconnect still active: a send arriving during replay takes the deferral path.
        attemptingReconnect: true,
        ensurePublisherConnected: vi.fn().mockResolvedValue(undefined),
        dataChannelForKind: vi.fn(() => dc),
        pcManager: {
          getMaxPublisherMessageSize: vi.fn(() => 64 * 1024 - 1),
        },
      });

      const buffer = (engine as unknown as { reliableMessageBuffer: DataPacketBuffer })
        .reliableMessageBuffer;
      const replayed = new Uint8Array([1]);
      buffer.push({ data: replayed, sequence: 1, sent: true });
      // Full buffer so replay parks on waitForBufferHeadroom before its first send.
      dc.bufferedAmount = 2 * 1024 * 1024;

      const replay = (
        engine as unknown as { resendReliableMessagesForResume: (seq: number) => Promise<void> }
      ).resendReliableMessagesForResume(0);
      await tick();

      // A reliable send arrives while replay is parked; attemptingReconnect defers it into the
      // buffer as sent:false, after the replay's first drain pass already started.
      const deferred = new Uint8Array([2]);
      const deferredSend = engine.sendDataPacket(
        new DataPacket({
          kind: DataPacket_Kind.RELIABLE,
          value: { case: 'user', value: new UserPacket({ payload: deferred }) },
        }),
        DataChannelKind.RELIABLE,
      );
      await tick();

      dc.bufferedAmount = 0;
      dc.dispatchEvent(new Event('bufferedamountlow'));
      await Promise.all([replay, deferredSend]);

      // Pre-fix, replay sends only its snapshot ([replayed]) and blanket-marks the deferred packet
      // sent without ever transmitting it — one send. The drain loop must transmit both (the
      // deferred packet is serialized through sendDataPacket, so it's distinct from `replayed`),
      // leaving nothing unsent for a later align to strand.
      const sent = dc.send.mock.calls.map(([d]) => d);
      expect(sent).toHaveLength(2);
      expect(sent[0]).toBe(replayed);
      expect(sent[1]).not.toBe(replayed);
      expect(buffer.getUnsent()).toHaveLength(0);
    });
  });

  describe('reliable sends during teardown windows', () => {
    const makePacket = (byte: number) =>
      new DataPacket({
        kind: DataPacket_Kind.RELIABLE,
        value: { case: 'user', value: new UserPacket({ payload: new Uint8Array([byte]) }) },
      });

    function stubEngine(engine: RTCEngine, dc: FakeDataChannel) {
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        ensurePublisherConnected: vi.fn().mockResolvedValue(undefined),
        dataChannelForKind: vi.fn(() => dc),
        pcManager: {
          getMaxPublisherMessageSize: vi.fn(() => 64 * 1024 - 1),
        },
      });
      return (engine as unknown as { reliableMessageBuffer: DataPacketBuffer })
        .reliableMessageBuffer;
    }

    it('resolves and queues the packet for replay when the wait is torn down transiently', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      const buffer = stubEngine(engine, dc);

      // Park the send on a full buffer, then invalidate the channel (reconnect/replacement).
      dc.bufferedAmount = 2 * 1024 * 1024;
      const send = engine.sendDataPacket(makePacket(1), DataChannelKind.RELIABLE);
      await tick();
      (
        engine as unknown as { invalidateDataChannelWaiters: (reason: string) => void }
      ).invalidateDataChannelWaiters('data channels recreated');

      // The send must not surface the teardown — the packet is queued for the resume replay.
      await expect(send).resolves.toBeUndefined();
      expect(dc.send).not.toHaveBeenCalled();
      expect(buffer.length).toBe(1);
      expect(buffer.getAll()[0].sent).toBe(false);

      // The replay then delivers it.
      dc.bufferedAmount = 0;
      await (
        engine as unknown as { resendReliableMessagesForResume: (seq: number) => Promise<void> }
      ).resendReliableMessagesForResume(0);
      expect(dc.send).toHaveBeenCalledTimes(1);
      expect(buffer.getAll()[0].sent).toBe(true);
    });

    it('still rejects when the engine is closed while waiting', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      stubEngine(engine, dc);

      dc.bufferedAmount = 2 * 1024 * 1024;
      const send = engine.sendDataPacket(makePacket(1), DataChannelKind.RELIABLE);
      await tick();
      Object.assign(engine as unknown as Record<string, unknown>, { _isClosed: true });
      (
        engine as unknown as { invalidateDataChannelWaiters: (reason: string) => void }
      ).invalidateDataChannelWaiters('engine closed');

      await expect(send).rejects.toBeInstanceOf(UnexpectedConnectionState);
      expect(dc.send).not.toHaveBeenCalled();
    });

    it('queues without waiting while a reconnect attempt is in progress', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      const buffer = stubEngine(engine, dc);
      Object.assign(engine as unknown as Record<string, unknown>, { attemptingReconnect: true });

      // Even with a full buffer, the send resolves immediately instead of parking.
      dc.bufferedAmount = 2 * 1024 * 1024;
      await expect(
        engine.sendDataPacket(makePacket(1), DataChannelKind.RELIABLE),
      ).resolves.toBeUndefined();
      expect(dc.send).not.toHaveBeenCalled();
      expect(buffer.length).toBe(1);
      expect(buffer.getAll()[0].sent).toBe(false);
    });
  });

  describe('sendLossyBytes', () => {
    it('ensures the publisher is connected before sending (direct data-track path)', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      // The channel only becomes available once the publisher connection has been established —
      // mirroring the lazily negotiated publisher case that Room's packetAvailable path hits.
      let connected = false;
      const ensurePublisherConnected = vi.fn(async () => {
        connected = true;
      });
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        ensurePublisherConnected,
        dataChannelForKind: vi.fn(() => (connected ? dc : undefined)),
      });

      await engine.sendLossyBytes(new Uint8Array([1]), DataChannelKind.DATA_TRACK_LOSSY, 'wait');

      expect(ensurePublisherConnected).toHaveBeenCalledWith(DataChannelKind.DATA_TRACK_LOSSY);
      expect(dc.send).toHaveBeenCalledTimes(1);
    });

    it('only counts LOSSY bytes into the byterate stat that tunes the lossy drop threshold', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        ensurePublisherConnected: vi.fn().mockResolvedValue(undefined),
        dataChannelForKind: vi.fn(() => dc),
      });
      const stat = () =>
        (engine as unknown as { lossyDataStatCurrentBytes: number }).lossyDataStatCurrentBytes;

      // Data-track traffic must not move the stat — it would inflate the LOSSY channel's
      // dynamically tuned drop threshold with traffic that channel never carries.
      await engine.sendLossyBytes(new Uint8Array(1000), DataChannelKind.DATA_TRACK_LOSSY, 'wait');
      expect(stat()).toBe(0);

      await engine.sendLossyBytes(new Uint8Array(100), DataChannelKind.LOSSY, 'drop');
      expect(stat()).toBe(100);
    });
  });

  describe('waitForBufferHeadroom', () => {
    it('rejects parked waiters and releases the lock when the data channels are invalidated', async () => {
      const engine = new RTCEngine(roomOptionDefaults);
      const dc = new FakeDataChannel();
      Object.assign(engine as unknown as Record<string, unknown>, {
        _isClosed: false,
        dataChannelForKind: vi.fn(() => dc),
      });

      // Park a waiter: buffer above the reliable high-water mark, holding the headroom lock.
      dc.bufferedAmount = 2 * 1024 * 1024;
      const parked = engine.waitForBufferHeadroom(DataChannelKind.RELIABLE);
      // Swallow the expected rejection so it can't surface as unhandled before we assert on it.
      parked.catch(() => {});
      await tick();

      // The channel object gets abandoned (e.g. createDataChannels on the Safari resume path).
      (
        engine as unknown as { invalidateDataChannelWaiters: (reason: string) => void }
      ).invalidateDataChannelWaiters('data channels recreated');

      await expect(parked).rejects.toBeInstanceOf(UnexpectedConnectionState);

      // The lock must be free again: a wait against the fresh, drained channel resolves instead
      // of queueing forever behind the stranded waiter.
      dc.bufferedAmount = 0;
      await expect(engine.waitForBufferHeadroom(DataChannelKind.RELIABLE)).resolves.toBeUndefined();
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
