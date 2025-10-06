import { JoinResponse, LeaveRequest, ReconnectResponse, SignalResponse } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError, ConnectionErrorReason } from '../room/errors';
import { SignalClient, SignalConnectionState } from './SignalClient';
import type { WebSocketCloseInfo, WebSocketConnection } from './WebSocketStream';
import { WebSocketStream } from './WebSocketStream';

// Mock the WebSocketStream
vi.mock('./WebSocketStream');

// Mock fetch for validation endpoint
global.fetch = vi.fn();

describe('SignalClient.connect', () => {
  let signalClient: SignalClient;

  const defaultOptions = {
    autoSubscribe: true,
    maxRetries: 0,
    e2eeEnabled: false,
    websocketTimeout: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    signalClient = new SignalClient(false);
  });

  describe('Happy Path - Initial Join', () => {
    it('should successfully connect and receive join response', async () => {
      const joinResponse = new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
        pingTimeout: 30,
        pingInterval: 10,
      });

      const signalResponse = new SignalResponse({
        message: { case: 'join', value: joinResponse },
      });

      // Setup mock that immediately provides the join response
      const mockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(signalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const mockConnection: WebSocketConnection = {
        readable: mockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(mockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      const result = await signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions);

      expect(result).toEqual(joinResponse);
      expect(signalClient.currentState).toBe(SignalConnectionState.CONNECTED);
    });
  });

  describe('Happy Path - Reconnect', () => {
    it('should successfully reconnect and receive reconnect response', async () => {
      // First, set up initial connection
      const joinResponse = new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
        pingTimeout: 30,
        pingInterval: 10,
      });

      const joinSignalResponse = new SignalResponse({
        message: { case: 'join', value: joinResponse },
      });

      const initialMockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(joinSignalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const initialMockConnection: WebSocketConnection = {
        readable: initialMockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementationOnce(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(initialMockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      await signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions);

      // Now test reconnect
      const reconnectResponse = new ReconnectResponse({
        iceServers: [],
      });

      const reconnectSignalResponse = new SignalResponse({
        message: { case: 'reconnect', value: reconnectResponse },
      });

      const reconnectMockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(reconnectSignalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const reconnectMockConnection: WebSocketConnection = {
        readable: reconnectMockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementationOnce(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(reconnectMockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      const result = await signalClient.reconnect('wss://test.livekit.io', 'test-token', 'sid-123');

      expect(result).toEqual(reconnectResponse);
      expect(signalClient.currentState).toBe(SignalConnectionState.CONNECTED);
    });

    it('should handle reconnect with non-reconnect message (edge case)', async () => {
      // First, initial connection
      const joinResponse = new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
        pingTimeout: 30,
        pingInterval: 10,
      });

      const joinSignalResponse = new SignalResponse({
        message: { case: 'join', value: joinResponse },
      });

      const initialMockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(joinSignalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const initialMockConnection: WebSocketConnection = {
        readable: initialMockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementationOnce(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(initialMockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      await signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions);

      console.log('joined successfully');

      // Setup reconnect with non-reconnect message (e.g., participant update)
      const updateSignalResponse = new SignalResponse({
        message: {
          case: 'update',
          value: { participants: [] },
        },
      });

      const reconnectMockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(updateSignalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const reconnectMockConnection: WebSocketConnection = {
        readable: reconnectMockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementationOnce(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(reconnectMockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      const result = await signalClient.reconnect('wss://test.livekit.io', 'test-token', 'sid-123');

      // This is an edge case: reconnect resolves with undefined when non-reconnect message is received
      expect(result).toBeUndefined();
      expect(signalClient.currentState).toBe(SignalConnectionState.CONNECTED);
    }, 1000);
  });

  describe('Failure Case - Timeout', () => {
    it('should reject with timeout error when websocket connection takes too long', async () => {
      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: new Promise(() => {}), // Never resolves
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 0,
          }) as any,
      );

      const shortTimeoutOptions = {
        ...defaultOptions,
        websocketTimeout: 100,
      };

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', shortTimeoutOptions),
      ).rejects.toThrow(ConnectionError);

      // await expect(
      //   signalClient.join('wss://test.livekit.io', 'test-token', shortTimeoutOptions),
      // ).rejects.toMatchObject({
      //   reason: ConnectionErrorReason.ServerUnreachable,
      // });
    });
  });

  describe('Failure Case - AbortSignal', () => {
    it('should reject when AbortSignal is triggered', async () => {
      const abortController = new AbortController();

      vi.mocked(WebSocketStream).mockImplementation(() => {
        // Simulate abort
        setTimeout(() => abortController.abort(new Error('User aborted connection')), 50);

        return {
          url: 'wss://test.livekit.io',
          opened: new Promise(() => {}), // Never resolves
          closed: new Promise(() => {}),
          close: vi.fn(),
          readyState: 0,
        } as any;
      });

      await expect(
        signalClient.join(
          'wss://test.livekit.io',
          'test-token',
          defaultOptions,
          abortController.signal,
        ),
      ).rejects.toThrow('User aborted connection');
    });
  });

  describe('Failure Case - WebSocket Connection Errors', () => {
    it('should reject with NotAllowed error for 4xx HTTP status', async () => {
      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.reject(new Error('Connection failed')),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 3,
          }) as any,
      );

      // Mock fetch to return 403
      (global.fetch as any).mockResolvedValueOnce({
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        message: 'Forbidden',
        reason: ConnectionErrorReason.NotAllowed,
        status: 403,
      });
    });

    it('should reject with ServerUnreachable when fetch fails', async () => {
      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.reject(new Error('Connection failed')),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 3,
          }) as any,
      );

      // Mock fetch to throw (network error)
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        reason: ConnectionErrorReason.ServerUnreachable,
      });
    });

    it('should handle ConnectionError from WebSocket rejection', async () => {
      const customError = new ConnectionError(
        'Custom error',
        ConnectionErrorReason.InternalError,
        500,
      );

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.reject(customError),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 3,
          }) as any,
      );

      // Mock fetch to return 500
      (global.fetch as any).mockResolvedValueOnce({
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        reason: ConnectionErrorReason.InternalError,
      });
    });
  });

  describe('Failure Case - No First Message', () => {
    it('should reject when no first message is received', async () => {
      // Close the stream immediately without sending a message
      const mockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.close();
        },
      });

      const mockConnection: WebSocketConnection = {
        readable: mockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(mockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        message: 'no message received as first message',
        reason: ConnectionErrorReason.InternalError,
      });
    });
  });

  describe('Failure Case - Leave Request During Connection', () => {
    it('should reject when receiving leave request during initial join', async () => {
      const leaveRequest = new LeaveRequest({
        reason: 1, // Some disconnect reason
      });

      const signalResponse = new SignalResponse({
        message: { case: 'leave', value: leaveRequest },
      });

      const mockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(signalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const mockConnection: WebSocketConnection = {
        readable: mockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(mockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject(
        new ConnectionError(
          'Received leave request while trying to (re)connect',
          ConnectionErrorReason.LeaveRequest,
          undefined,
          1,
        ),
      );
    });
  });

  describe('Failure Case - Wrong Message Type for Non-Reconnect', () => {
    it('should reject when receiving non-join message on initial connection', async () => {
      // Send a reconnect response instead of join (wrong for initial connection)
      const reconnectResponse = new ReconnectResponse({
        iceServers: [],
      });

      const signalResponse = new SignalResponse({
        message: { case: 'reconnect', value: reconnectResponse },
      });

      const mockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(signalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const mockConnection: WebSocketConnection = {
        readable: mockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(mockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        message: 'did not receive join response, got reconnect instead',
        reason: ConnectionErrorReason.InternalError,
      });
    });
  });

  describe('Failure Case - WebSocket Closed During Connection', () => {
    it('should reject when WebSocket closes during connection attempt', async () => {
      let closedResolve: (value: WebSocketCloseInfo) => void;
      const closedPromise = new Promise<WebSocketCloseInfo>((resolve) => {
        closedResolve = resolve;
      });

      vi.mocked(WebSocketStream).mockImplementation(() => {
        // Simulate close during connection
        queueMicrotask(() => {
          closedResolve({ closeCode: 1006, reason: 'Connection lost' });
        });

        return {
          url: 'wss://test.livekit.io',
          opened: new Promise(() => {}), // Never resolves
          closed: closedPromise,
          close: vi.fn(),
          readyState: 2, // CLOSING
        } as any;
      });

      await expect(
        signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions),
      ).rejects.toMatchObject({
        message: 'Websocket got closed during a (re)connection attempt: Connection lost',
        reason: ConnectionErrorReason.InternalError,
      });
    });
  });

  describe('Edge Cases and State Management', () => {
    it('should set state to CONNECTING when joining', async () => {
      expect(signalClient.currentState).toBe(SignalConnectionState.DISCONNECTED);

      const joinResponse = new JoinResponse({
        room: { name: 'test-room', sid: 'room-sid' },
        participant: { sid: 'participant-sid', identity: 'test-user' },
        pingTimeout: 30,
        pingInterval: 10,
      });

      const signalResponse = new SignalResponse({
        message: { case: 'join', value: joinResponse },
      });

      const mockReadable = new ReadableStream<ArrayBuffer>({
        async start(controller) {
          controller.enqueue(signalResponse.toBinary().buffer as ArrayBuffer);
        },
      });

      const mockConnection: WebSocketConnection = {
        readable: mockReadable,
        writable: new WritableStream(),
        protocol: '',
        extensions: '',
      };

      vi.mocked(WebSocketStream).mockImplementation(
        () =>
          ({
            url: 'wss://test.livekit.io',
            opened: Promise.resolve(mockConnection),
            closed: new Promise(() => {}),
            close: vi.fn(),
            readyState: 1,
          }) as any,
      );

      const joinPromise = signalClient.join('wss://test.livekit.io', 'test-token', defaultOptions);

      // State should be CONNECTING before connection completes
      expect(signalClient.currentState).toBe(SignalConnectionState.CONNECTING);

      await joinPromise;

      expect(signalClient.currentState).toBe(SignalConnectionState.CONNECTED);
    });
  });
});
