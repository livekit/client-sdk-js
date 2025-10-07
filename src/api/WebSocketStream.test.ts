/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketStream } from './WebSocketStream';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;

  static OPEN = 1;

  static CLOSING = 2;

  static CLOSED = 3;

  url: string;

  protocol: string;

  extensions: string;

  readyState: number;

  binaryType: BinaryType;

  onopen: ((event: Event) => void) | null = null;

  onclose: ((event: CloseEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  private eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocol = Array.isArray(protocols) && protocols.length > 0 ? protocols[0] : '';
    this.extensions = '';
    this.readyState = MockWebSocket.CONNECTING;
    this.binaryType = 'arraybuffer';
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError');
    }
  }

  close(code?: number, reason?: string) {
    if (this.readyState === MockWebSocket.CLOSING || this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSING;
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }

    // Also call on* handlers
    if (event.type === 'open' && this.onopen) {
      this.onopen(event);
    } else if (event.type === 'close' && this.onclose) {
      this.onclose(event as CloseEvent);
    } else if (event.type === 'error' && this.onerror) {
      this.onerror(event);
    } else if (event.type === 'message' && this.onmessage) {
      this.onmessage(event as MessageEvent);
    }

    return true;
  }

  // Test helpers
  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  triggerClose(code: number = 1000, reason: string = '') {
    this.readyState = MockWebSocket.CLOSED;
    const closeEvent = Object.assign(new Event('close'), {
      code,
      reason,
      wasClean: code === 1000,
    }) as CloseEvent;
    this.dispatchEvent(closeEvent);
  }

  triggerError() {
    const errorEvent = new Event('error');
    this.dispatchEvent(errorEvent);
  }

  triggerMessage(data: any) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('Cannot send message when WebSocket is not open');
    }
    const messageEvent = new MessageEvent('message', { data });
    this.dispatchEvent(messageEvent);
  }
}

// Mock sleep function
vi.mock('../room/utils', () => ({
  sleep: vi.fn((duration: number) => new Promise((resolve) => setTimeout(resolve, duration))),
}));

describe('WebSocketStream', () => {
  let mockWebSocket: MockWebSocket;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store original WebSocket
    originalWebSocket = global.WebSocket;

    // Mock WebSocket globally
    global.WebSocket = vi.fn((url: string, protocols?: string | string[]) => {
      mockWebSocket = new MockWebSocket(url, protocols);
      return mockWebSocket as any;
    }) as any;

    // Add constants to the mocked WebSocket
    (global.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
    (global.WebSocket as any).OPEN = MockWebSocket.OPEN;
    (global.WebSocket as any).CLOSING = MockWebSocket.CLOSING;
    (global.WebSocket as any).CLOSED = MockWebSocket.CLOSED;
  });

  afterEach(() => {
    // Restore original WebSocket
    global.WebSocket = originalWebSocket;
  });

  describe('Constructor and Initialization', () => {
    it('should create WebSocketStream with URL', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      expect(wsStream.url).toBe('wss://test.example.com');
      expect(mockWebSocket.url).toBe('wss://test.example.com');
      expect(mockWebSocket.binaryType).toBe('arraybuffer');
    });

    it('should set readyState property', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      expect(wsStream.readyState).toBe(MockWebSocket.CONNECTING);

      mockWebSocket.triggerOpen();
      expect(wsStream.readyState).toBe(MockWebSocket.OPEN);
    });

    it('should handle protocols option', () => {
      const wsStream = new WebSocketStream('wss://test.example.com', {
        protocols: ['protocol1', 'protocol2'],
      });

      expect(mockWebSocket.protocol).toBe('protocol1');
    });

    it('should throw when signal is already aborted', () => {
      const abortController = new AbortController();
      abortController.abort();

      expect(() => {
        new WebSocketStream('wss://test.example.com', {
          signal: abortController.signal,
        });
      }).toThrow(DOMException);

      expect(() => {
        new WebSocketStream('wss://test.example.com', {
          signal: abortController.signal,
        });
      }).toThrow('This operation was aborted');
    });

    it('should set up abort signal listener', () => {
      const abortController = new AbortController();
      const wsStream = new WebSocketStream('wss://test.example.com', {
        signal: abortController.signal,
      });

      const closeSpy = vi.spyOn(mockWebSocket, 'close');
      abortController.abort();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('opened Promise - Success Scenarios', () => {
    it('should resolve opened promise when WebSocket opens', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const openedPromise = wsStream.opened;
      mockWebSocket.triggerOpen();

      const connection = await openedPromise;

      expect(connection).toBeDefined();
      expect(connection.readable).toBeInstanceOf(ReadableStream);
      expect(connection.writable).toBeInstanceOf(WritableStream);
      expect(connection.protocol).toBe(mockWebSocket.protocol);
      expect(connection.extensions).toBe(mockWebSocket.extensions);
    });

    it('should resolve opened promise with protocol and extensions', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com', {
        protocols: ['test-protocol'],
      });

      mockWebSocket.protocol = 'test-protocol';
      mockWebSocket.extensions = 'test-extension';
      mockWebSocket.triggerOpen();

      const connection = await wsStream.opened;

      expect(connection.protocol).toBe('test-protocol');
      expect(connection.extensions).toBe('test-extension');
    });

    it('should remove error listener after successful open', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const removeEventListenerSpy = vi.spyOn(mockWebSocket, 'removeEventListener');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('opened Promise - Error Scenarios', () => {
    it('should reject opened promise when WebSocket errors before opening', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const openedPromise = wsStream.opened;
      mockWebSocket.triggerError();

      await expect(openedPromise).rejects.toThrow();
    });

    it('should handle error during connection setup', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerError();

      await expect(wsStream.opened).rejects.toBeDefined();
    });
  });

  describe('closed Promise - Normal Close', () => {
    it('should resolve closed promise when WebSocket closes normally', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      mockWebSocket.triggerClose(1000, 'Normal closure');

      const closeInfo = await wsStream.closed;

      expect(closeInfo.closeCode).toBe(1000);
      expect(closeInfo.reason).toBe('Normal closure');
    });

    it('should resolve closed promise with custom close code', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      mockWebSocket.triggerClose(1001, 'Going away');

      const closeInfo = await wsStream.closed;

      expect(closeInfo.closeCode).toBe(1001);
      expect(closeInfo.reason).toBe('Going away');
    });

    it('should remove error listener after normal close', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const removeEventListenerSpy = vi.spyOn(mockWebSocket, 'removeEventListener');

      mockWebSocket.triggerOpen();
      mockWebSocket.triggerClose(1000);
      await wsStream.closed;

      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('closed Promise - Error Scenarios', () => {
    it('should handle error followed by close event within timeout', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();

      // Trigger error
      mockWebSocket.triggerError();

      // Immediately trigger close before timeout
      mockWebSocket.triggerClose(1006, 'Connection failed');

      const closeInfo = await wsStream.closed;

      expect(closeInfo.closeCode).toBe(1006);
      expect(closeInfo.reason).toBe('Connection failed');
    });

    it('should reject when error occurs without timely close event', async () => {
      const { sleep } = await import('../room/utils');
      vi.mocked(sleep).mockResolvedValue(undefined);

      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      mockWebSocket.triggerError();

      await expect(wsStream.closed).rejects.toThrow(
        'Encountered unspecified websocket error without a timely close event',
      );
    });

    it('should handle error when WebSocket is already closed', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      mockWebSocket.triggerClose(1005, 'test');
      mockWebSocket.triggerError();

      // Since WebSocket is already closed, the error handler returns immediately
      // The closed promise might be pending or resolved depending on timing
      // This tests that the implementation handles this edge case gracefully
      await wsStream.closed;
    });
  });

  describe('ReadableStream behavior', () => {
    it('should enqueue messages received from WebSocket', async () => {
      const wsStream = new WebSocketStream<ArrayBuffer>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Send messages
      const message1 = new ArrayBuffer(8);
      const message2 = new ArrayBuffer(16);

      mockWebSocket.triggerMessage(message1);
      mockWebSocket.triggerMessage(message2);

      const result1 = await reader.read();
      expect(result1.done).toBe(false);
      expect(result1.value).toBe(message1);

      const result2 = await reader.read();
      expect(result2.done).toBe(false);
      expect(result2.value).toBe(message2);

      reader.releaseLock();
    });

    it('should handle string messages', async () => {
      const wsStream = new WebSocketStream<string>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      mockWebSocket.triggerMessage('Hello, World!');

      const result = await reader.read();
      expect(result.done).toBe(false);
      expect(result.value).toBe('Hello, World!');

      reader.releaseLock();
    });

    it('should error readable stream when WebSocket errors', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      mockWebSocket.triggerError();

      await Promise.all([
        expect(reader.read()).rejects.toBeDefined(),
        expect(wsStream.closed).rejects.toBeDefined(),
      ]);
    });

    it('should close WebSocket when readable stream is cancelled', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      await reader.cancel();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should close WebSocket with custom close info when cancelled', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      await reader.cancel({ closeCode: 1001, reason: 'Client is leaving' });

      expect(closeSpy).toHaveBeenCalledWith(1001, 'Client is leaving');
    });

    it('should handle multiple readers (locked stream)', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader1 = connection.readable.getReader();

      // Attempting to get a second reader should throw
      expect(() => connection.readable.getReader()).toThrow();

      reader1.releaseLock();
    });
  });

  describe('WritableStream behavior', () => {
    it('should send data through WebSocket when writing to stream', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const sendSpy = vi.spyOn(mockWebSocket, 'send');

      const data = new ArrayBuffer(8);
      await writer.write(data);

      expect(sendSpy).toHaveBeenCalledWith(data);

      await writer.close();
    });

    it('should send string data through WebSocket', async () => {
      const wsStream = new WebSocketStream<string>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const sendSpy = vi.spyOn(mockWebSocket, 'send');

      await writer.write('Hello, WebSocket!');

      expect(sendSpy).toHaveBeenCalledWith('Hello, WebSocket!');

      await writer.close();
    });

    it('should close WebSocket when writable stream is closed', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      await writer.close();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should close WebSocket with custom close info when writable closes', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      // Note: WritableStreamDefaultWriter.close() doesn't accept arguments
      // The close info is passed through the cancel method
      await writer.close();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should abort WebSocket when writable stream is aborted', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      await writer.abort();

      expect(closeSpy).toHaveBeenCalledWith();
    });

    it('should handle writing multiple chunks', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();
      const sendSpy = vi.spyOn(mockWebSocket, 'send');

      const chunk1 = new ArrayBuffer(8);
      const chunk2 = new ArrayBuffer(16);
      const chunk3 = new ArrayBuffer(32);

      await writer.write(chunk1);
      await writer.write(chunk2);
      await writer.write(chunk3);

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sendSpy).toHaveBeenNthCalledWith(1, chunk1);
      expect(sendSpy).toHaveBeenNthCalledWith(2, chunk2);
      expect(sendSpy).toHaveBeenNthCalledWith(3, chunk3);

      await writer.close();
    });

    it('should throw error when writing to closed WebSocket', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();

      // Close the WebSocket
      mockWebSocket.readyState = MockWebSocket.CLOSED;

      const data = new ArrayBuffer(8);
      await expect(writer.write(data)).rejects.toThrow('WebSocket is not open');
    });
  });

  describe('close() method', () => {
    it('should close WebSocket when close method is called', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should close WebSocket with custom close code and reason', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close({ closeCode: 1001, reason: 'Going away' });

      expect(closeSpy).toHaveBeenCalledWith(1001, 'Going away');
    });

    it('should handle close with only close code', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close({ closeCode: 1000 });

      expect(closeSpy).toHaveBeenCalledWith(1000, undefined);
    });

    it('should handle close with only reason', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close({ reason: 'Custom reason' });

      expect(closeSpy).toHaveBeenCalledWith(undefined, 'Custom reason');
    });

    it('should handle close without arguments', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close();

      expect(closeSpy).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe('AbortSignal integration', () => {
    it('should close WebSocket when AbortSignal is triggered', () => {
      const abortController = new AbortController();
      const wsStream = new WebSocketStream('wss://test.example.com', {
        signal: abortController.signal,
      });

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      abortController.abort();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should handle abort after WebSocket is already open', async () => {
      const abortController = new AbortController();
      const wsStream = new WebSocketStream('wss://test.example.com', {
        signal: abortController.signal,
      });

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      abortController.abort();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should handle abort during connection attempt', () => {
      const abortController = new AbortController();
      const wsStream = new WebSocketStream('wss://test.example.com', {
        signal: abortController.signal,
      });

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      // Abort before connection opens
      abortController.abort();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should work without AbortSignal', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      expect(connection).toBeDefined();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle WebSocket closing immediately after opening', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      mockWebSocket.triggerClose(1000, 'Immediate close');
      const closeInfo = await wsStream.closed;

      expect(closeInfo.closeCode).toBe(1000);
      expect(closeInfo.reason).toBe('Immediate close');
    });

    it('should handle multiple close calls', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      wsStream.close({ closeCode: 1000 });
      wsStream.close({ closeCode: 1001 });
      wsStream.close({ closeCode: 1002 });

      // close() should not throw even when called multiple times
      expect(closeSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle error event followed by immediate recovery', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();

      // Trigger error but then close normally before timeout
      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1000, 'Clean close after error');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1000);
    });

    it('should handle reading from stream after WebSocket closes', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Send a message then close
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      mockWebSocket.triggerClose(1000);

      // Should still be able to read the buffered message
      const result = await reader.read();
      expect(result.done).toBe(false);
    });

    it('should handle empty protocol array', () => {
      const wsStream = new WebSocketStream('wss://test.example.com', {
        protocols: [],
      });

      expect(mockWebSocket.protocol).toBe('');
    });

    it('should have proper readyState transitions', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      expect(wsStream.readyState).toBe(MockWebSocket.CONNECTING);

      mockWebSocket.triggerOpen();
      expect(wsStream.readyState).toBe(MockWebSocket.OPEN);

      mockWebSocket.readyState = MockWebSocket.CLOSING;
      expect(wsStream.readyState).toBe(MockWebSocket.CLOSING);

      mockWebSocket.triggerClose(1000);
      expect(wsStream.readyState).toBe(MockWebSocket.CLOSED);
    });
  });

  describe('Stream integration - bidirectional communication', () => {
    it('should support simultaneous reading and writing', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      // Write data
      const outgoingData = new ArrayBuffer(8);
      const writePromise = writer.write(outgoingData);

      // Receive data
      const incomingData = new ArrayBuffer(16);
      mockWebSocket.triggerMessage(incomingData);

      await writePromise;
      const readResult = await reader.read();

      expect(readResult.value).toBe(incomingData);

      reader.releaseLock();
      await writer.close();
    });

    it('should handle rapid message exchanges', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      // Rapid writes
      const writePromises = [];
      for (let i = 0; i < 10; i++) {
        writePromises.push(writer.write(new ArrayBuffer(i)));
      }

      // Rapid reads
      for (let i = 0; i < 10; i++) {
        mockWebSocket.triggerMessage(new ArrayBuffer(i + 100));
      }

      await Promise.all(writePromises);

      const readResults = [];
      for (let i = 0; i < 10; i++) {
        readResults.push(await reader.read());
      }

      expect(readResults).toHaveLength(10);
      expect(readResults.every((result) => !result.done)).toBe(true);

      reader.releaseLock();
      await writer.close();
    });

    it('should handle piping between streams', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      // Create a source stream
      const sourceData = [new ArrayBuffer(8), new ArrayBuffer(16), new ArrayBuffer(32)];
      let dataIndex = 0;

      const sourceStream = new ReadableStream({
        pull(controller) {
          if (dataIndex < sourceData.length) {
            controller.enqueue(sourceData[dataIndex++]);
          } else {
            controller.close();
          }
        },
      });

      const sendSpy = vi.spyOn(mockWebSocket, 'send');

      // Pipe source stream to WebSocket writable
      await sourceStream.pipeTo(connection.writable);

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sendSpy).toHaveBeenNthCalledWith(1, sourceData[0]);
      expect(sendSpy).toHaveBeenNthCalledWith(2, sourceData[1]);
      expect(sendSpy).toHaveBeenNthCalledWith(3, sourceData[2]);
    });
  });

  describe('Type safety - ArrayBuffer vs string', () => {
    it('should work with ArrayBuffer type', async () => {
      const wsStream = new WebSocketStream<ArrayBuffer>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      const buffer = new ArrayBuffer(8);
      await writer.write(buffer);

      mockWebSocket.triggerMessage(buffer);
      const result = await reader.read();

      expect(result.value).toBe(buffer);

      reader.releaseLock();
      await writer.close();
    });

    it('should work with string type', async () => {
      const wsStream = new WebSocketStream<string>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      const message = 'Hello, WebSocket!';
      await writer.write(message);

      mockWebSocket.triggerMessage(message);
      const result = await reader.read();

      expect(result.value).toBe(message);

      reader.releaseLock();
      await writer.close();
    });

    it('should work with union type ArrayBuffer | string', async () => {
      const wsStream = new WebSocketStream<ArrayBuffer | string>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      // Write string
      await writer.write('string message');

      // Write ArrayBuffer
      const buffer = new ArrayBuffer(8);
      await writer.write(buffer);

      // Receive both types
      mockWebSocket.triggerMessage('received string');
      mockWebSocket.triggerMessage(new ArrayBuffer(16));

      const result1 = await reader.read();
      expect(typeof result1.value === 'string').toBe(true);

      const result2 = await reader.read();
      expect(result2.value instanceof ArrayBuffer).toBe(true);

      reader.releaseLock();
      await writer.close();
    });
  });

  describe('Ongoing connection error scenarios', () => {
    it('should handle error during ongoing connection with immediate close', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Send some successful messages first
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      const result1 = await reader.read();
      expect(result1.done).toBe(false);

      // Now trigger error immediately followed by close (no delay)
      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1006, 'Connection interrupted');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1006);
      expect(closeInfo.reason).toBe('Connection interrupted');

      reader.releaseLock();
    });

    it('should reject when error occurs during ongoing connection without close event', async () => {
      const { sleep } = await import('../room/utils');
      vi.mocked(sleep).mockResolvedValue(undefined);

      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      // Establish some communication
      const reader = connection.readable.getReader();
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      await reader.read();

      // Trigger error without any close event following
      mockWebSocket.triggerError();

      // The closed promise should reject after timeout
      await expect(wsStream.closed).rejects.toThrow(
        'Encountered unspecified websocket error without a timely close event',
      );

      reader.releaseLock();
    });

    it('should handle multiple errors during ongoing connection', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      // Trigger multiple errors (simulating flaky connection)
      mockWebSocket.triggerError();
      mockWebSocket.triggerError();
      mockWebSocket.triggerError();

      // Finally close
      mockWebSocket.triggerClose(1006, 'Multiple errors occurred');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1006);
      expect(closeInfo.reason).toBe('Multiple errors occurred');
    });

    it('should handle error while actively streaming data', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Stream multiple messages
      for (let i = 0; i < 5; i++) {
        mockWebSocket.triggerMessage(new ArrayBuffer(i * 8));
      }

      // Read some messages
      await reader.read();
      await reader.read();

      // Trigger error mid-stream
      mockWebSocket.triggerError();

      // Reading should fail
      await Promise.all([
        expect(reader.read()).rejects.toBeDefined(),
        expect(wsStream.closed).rejects.toBeDefined(),
      ]);
    });

    it('should handle error during write operation in ongoing connection', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();

      // Perform successful writes
      await writer.write(new ArrayBuffer(8));
      await writer.write(new ArrayBuffer(16));

      // Trigger error
      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1006, 'Write error');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1006);

      writer.releaseLock();
    });

    it('should handle error followed by close with empty reason', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1000, '');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1000);
      expect(closeInfo.reason).toBe('');
    });

    it('should handle error in established connection with network loss (1006)', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      // Simulate active bidirectional communication
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      await writer.write(new ArrayBuffer(8));
      await reader.read();

      // Simulate network loss
      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1006, 'Abnormal Closure');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1006);
      expect(closeInfo.reason).toBe('Abnormal Closure');

      reader.releaseLock();
      writer.releaseLock();
    });

    it('should handle error with close code 1011 (server error)', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      // Simulate server encountering an error
      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1011, 'Server encountered an error');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1011);
      expect(closeInfo.reason).toBe('Server encountered an error');
    });

    it('should handle error during reader consumption', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Queue messages
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      mockWebSocket.triggerMessage(new ArrayBuffer(16));
      mockWebSocket.triggerMessage(new ArrayBuffer(32));

      // Read first message
      const result1 = await reader.read();
      expect(result1.done).toBe(false);

      // Error while more messages are queued
      mockWebSocket.triggerError();

      // Subsequent reads should fail
      await Promise.all([
        expect(reader.read()).rejects.toBeDefined(),
        expect(wsStream.closed).rejects.toBeDefined(),
      ]);
    });

    it('should handle error after close was already initiated', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      // Initiate close
      wsStream.close({ closeCode: 1000, reason: 'Normal close' });
      mockWebSocket.readyState = MockWebSocket.CLOSING;

      // Error occurs while closing
      mockWebSocket.triggerError();

      // Then close completes
      mockWebSocket.triggerClose(1000, 'Normal close');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1000);
      expect(closeInfo.reason).toBe('Normal close');
    });

    it('should handle error without close exceeding timeout threshold', async () => {
      const { sleep } = await import('../room/utils');
      vi.mocked(sleep).mockResolvedValue(undefined);

      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      // Long-running connection
      for (let i = 0; i < 10; i++) {
        mockWebSocket.triggerMessage(new ArrayBuffer(i * 4));
      }

      // Error without close
      mockWebSocket.triggerError();

      // Should reject after timeout
      await expect(wsStream.closed).rejects.toThrow(
        'Encountered unspecified websocket error without a timely close event',
      );
    });

    it('should preserve error in readable stream when error occurs during ongoing read', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Start reading
      const readPromise1 = reader.read();
      mockWebSocket.triggerMessage(new ArrayBuffer(8));
      await readPromise1;

      // Start another read that will be interrupted
      const readPromise2 = reader.read();

      // Trigger error while read is pending
      mockWebSocket.triggerError();

      await Promise.all([
        expect(readPromise2).rejects.toBeDefined(),
        expect(wsStream.closed).rejects.toBeDefined(),
      ]);
      // All subsequent reads should also fail
      await expect(reader.read()).rejects.toBeDefined();
    });

    it('should handle error timing - close at 0ms', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      mockWebSocket.triggerError();
      mockWebSocket.triggerClose(1000, 'Immediate close');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1000);
      expect(closeInfo.reason).toBe('Immediate close');
    });
  });

  describe('Complex scenarios and race conditions', () => {
    it('should handle close called during connection establishment', () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const closeSpy = vi.spyOn(mockWebSocket, 'close');

      // Close before WebSocket opens
      wsStream.close({ closeCode: 1000, reason: 'Early close' });

      expect(closeSpy).toHaveBeenCalledWith(1000, 'Early close');
    });

    it('should handle multiple messages before first read', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      // Queue up multiple messages before reading
      const msg1 = new ArrayBuffer(8);
      const msg2 = new ArrayBuffer(16);
      const msg3 = new ArrayBuffer(32);

      mockWebSocket.triggerMessage(msg1);
      mockWebSocket.triggerMessage(msg2);
      mockWebSocket.triggerMessage(msg3);

      const reader = connection.readable.getReader();

      const result1 = await reader.read();
      expect(result1.value).toBe(msg1);

      const result2 = await reader.read();
      expect(result2.value).toBe(msg2);

      const result3 = await reader.read();
      expect(result3.value).toBe(msg3);

      reader.releaseLock();
    });

    it('should handle error during active read operation', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Start a read that will be interrupted by an error
      const readPromise = reader.read();

      // Trigger error while read is pending
      mockWebSocket.triggerError();

      await Promise.all([
        expect(readPromise).rejects.toBeDefined(),
        expect(wsStream.closed).rejects.toBeDefined(),
      ]);
    });

    it('should handle close during active write operation', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const writer = connection.writable.getWriter();

      // Start writing
      const data = new ArrayBuffer(8);
      await writer.write(data);

      // Close WebSocket
      wsStream.close({ closeCode: 1000 });

      // Further writes should fail
      mockWebSocket.readyState = MockWebSocket.CLOSED;
      await expect(writer.write(new ArrayBuffer(8))).rejects.toThrow();
    });

    it('should properly handle promise race between opened and closed', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      // Race between opening and closing
      const racePromise = Promise.race([wsStream.opened, wsStream.closed]);

      // Open wins
      mockWebSocket.triggerOpen();

      const result = await racePromise;
      expect(result).toHaveProperty('readable');
      expect(result).toHaveProperty('writable');
    });

    it('should handle error before opened promise resolves', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      const openedPromise = wsStream.opened;
      const closedPromise = wsStream.closed;

      // Error before open
      mockWebSocket.triggerError();

      await Promise.all([
        expect(openedPromise).rejects.toBeDefined(),
        expect(closedPromise).rejects.toBeDefined(),
      ]);
    });

    it('should handle rapid open-close cycles', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      expect(connection).toBeDefined();

      mockWebSocket.triggerClose(1000);
      const closeInfo = await wsStream.closed;

      expect(closeInfo.closeCode).toBe(1000);
    });

    it('should support zero-length messages', async () => {
      const wsStream = new WebSocketStream<ArrayBuffer>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      // Send zero-length ArrayBuffer
      const emptyBuffer = new ArrayBuffer(0);
      await writer.write(emptyBuffer);

      mockWebSocket.triggerMessage(emptyBuffer);
      const result = await reader.read();

      expect(result.value).toBe(emptyBuffer);
      expect(result.value?.byteLength).toBe(0);

      reader.releaseLock();
      await writer.close();
    });

    it('should support empty string messages', async () => {
      const wsStream = new WebSocketStream<string>('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();
      const writer = connection.writable.getWriter();

      await writer.write('');

      mockWebSocket.triggerMessage('');
      const result = await reader.read();

      expect(result.value).toBe('');

      reader.releaseLock();
      await writer.close();
    });

    it('should handle close with abnormal codes', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      // Close with abnormal codes
      mockWebSocket.triggerClose(1006, 'Abnormal closure');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1006);
      expect(closeInfo.reason).toBe('Abnormal closure');
    });

    it('should handle close with protocol error code', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      await wsStream.opened;

      mockWebSocket.triggerClose(1002, 'Protocol error');

      const closeInfo = await wsStream.closed;
      expect(closeInfo.closeCode).toBe(1002);
      expect(closeInfo.reason).toBe('Protocol error');
    });

    it('should verify binaryType is set to arraybuffer', () => {
      new WebSocketStream('wss://test.example.com');

      expect(mockWebSocket.binaryType).toBe('arraybuffer');
    });

    it('should handle URL with query parameters', () => {
      const urlWithParams = 'wss://test.example.com/path?token=abc123&room=test';
      const wsStream = new WebSocketStream(urlWithParams);

      expect(wsStream.url).toBe(urlWithParams);
      expect(mockWebSocket.url).toBe(urlWithParams);
    });

    it('should handle protocol selection from multiple options', () => {
      const protocols = ['protocol-v2', 'protocol-v1', 'legacy-protocol'];
      const wsStream = new WebSocketStream('wss://test.example.com', { protocols });

      // Mock typically selects the first protocol
      expect(mockWebSocket.protocol).toBe('protocol-v2');
    });

    it('should preserve message order under load', async () => {
      const wsStream = new WebSocketStream('wss://test.example.com');

      mockWebSocket.triggerOpen();
      const connection = await wsStream.opened;

      const reader = connection.readable.getReader();

      // Send 100 messages rapidly
      const messageCount = 100;
      for (let i = 0; i < messageCount; i++) {
        const buffer = new ArrayBuffer(4);
        const view = new Uint32Array(buffer);
        view[0] = i;
        mockWebSocket.triggerMessage(buffer);
      }

      // Read all messages and verify order
      for (let i = 0; i < messageCount; i++) {
        const result = await reader.read();
        const view = new Uint32Array(result.value as ArrayBuffer);
        expect(view[0]).toBe(i);
      }

      reader.releaseLock();
    });
  });
});
