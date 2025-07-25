import { Envelope, Fragment, Signalv2ClientMessage, Signalv2WireMessage } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WireMessageConverter } from './WireMessageConverter';

describe('WireMessageConverter', () => {
  let converter: WireMessageConverter;

  beforeEach(() => {
    converter = new WireMessageConverter();
  });

  describe('wireMessageToEnvelope', () => {
    it('should return envelope directly when wire message contains envelope', () => {
      const testEnvelope = new Envelope({
        clientMessages: [],
      });

      const wireMessage = new Signalv2WireMessage({
        message: {
          case: 'envelope',
          value: testEnvelope,
        },
      });

      const result = converter.wireMessageToEnvelope(wireMessage);

      expect(result).toBe(testEnvelope);
    });

    it('should return null for incomplete fragments', () => {
      const fragment = new Fragment({
        packetId: 1,
        fragmentNumber: 1,
        data: new Uint8Array([1, 2, 3]),
        totalSize: 10,
        numFragments: 3,
      });

      const wireMessage = new Signalv2WireMessage({
        message: {
          case: 'fragment',
          value: fragment,
        },
      });

      const result = converter.wireMessageToEnvelope(wireMessage);

      expect(result).toBeNull();
    });

    it('should assemble fragments when all are received', () => {
      const connectRequest = new Signalv2ClientMessage({
        message: {
          case: 'connectRequest',
          value: {
            metadata: 'test-metadata',
          },
        },
      });

      const testEnvelope = new Envelope({
        clientMessages: [connectRequest],
      });
      const binaryEnvelope = testEnvelope.toBinary();

      // Create fragments
      const fragment1 = new Fragment({
        packetId: 1,
        fragmentNumber: 1,
        data: binaryEnvelope.slice(0, Math.ceil(binaryEnvelope.length / 2)),
        totalSize: binaryEnvelope.byteLength,
        numFragments: 2,
      });

      const fragment2 = new Fragment({
        packetId: 1,
        fragmentNumber: 2,
        data: binaryEnvelope.slice(Math.ceil(binaryEnvelope.length / 2)),
        totalSize: binaryEnvelope.byteLength,
        numFragments: 2,
      });

      const wireMessage1 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment1 },
      });

      const wireMessage2 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment2 },
      });

      // First fragment should return null
      const result1 = converter.wireMessageToEnvelope(wireMessage1);
      expect(result1).toBeNull();

      // Second fragment should return assembled envelope
      const result2 = converter.wireMessageToEnvelope(wireMessage2);
      expect(result2).not.toBeNull();
      expect(result2?.clientMessages).toEqual([connectRequest]);
    });

    it('should handle fragments received out of order', () => {
      const testEnvelope = new Envelope({
        clientMessages: [],
      });
      const binaryEnvelope = testEnvelope.toBinary();

      // Create fragments
      const fragment1 = new Fragment({
        packetId: 2,
        fragmentNumber: 1,
        data: binaryEnvelope.slice(0, Math.ceil(binaryEnvelope.length / 2)),
        totalSize: binaryEnvelope.byteLength,
        numFragments: 2,
      });

      const fragment2 = new Fragment({
        packetId: 2,
        fragmentNumber: 2,
        data: binaryEnvelope.slice(Math.ceil(binaryEnvelope.length / 2)),
        totalSize: binaryEnvelope.byteLength,
        numFragments: 2,
      });

      const wireMessage1 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment1 },
      });

      const wireMessage2 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment2 },
      });

      // Receive second fragment first
      const result1 = converter.wireMessageToEnvelope(wireMessage2);
      expect(result1).toBeNull();

      // Receive first fragment second
      const result2 = converter.wireMessageToEnvelope(wireMessage1);
      expect(result2).not.toBeNull();
      expect(result2?.clientMessages).toEqual([]);
    });

    it('should return null and clear buffer when fragment total size is incorrect', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const fragment1 = new Fragment({
        packetId: 3,
        fragmentNumber: 1,
        data: new Uint8Array([1, 2, 3]),
        totalSize: 10, // Incorrect total size
        numFragments: 2,
      });

      const fragment2 = new Fragment({
        packetId: 3,
        fragmentNumber: 2,
        data: new Uint8Array([4, 5, 6]),
        totalSize: 10, // Incorrect total size
        numFragments: 2,
      });

      const wireMessage1 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment1 },
      });

      const wireMessage2 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment2 },
      });

      converter.wireMessageToEnvelope(wireMessage1);
      const result = converter.wireMessageToEnvelope(wireMessage2);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fragments of packet 3 have incorrect size'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle multiple fragment sets simultaneously', () => {
      const testEnvelope1 = new Envelope({
        clientMessages: [],
      });
      const testEnvelope2 = new Envelope({
        clientMessages: [],
      });

      const binaryEnvelope1 = testEnvelope1.toBinary();
      const binaryEnvelope2 = testEnvelope2.toBinary();

      // Create fragments for first envelope (packet ID 1)
      const frag1Part1 = new Fragment({
        packetId: 1,
        fragmentNumber: 1,
        data: binaryEnvelope1.slice(0, Math.ceil(binaryEnvelope1.length / 2)),
        totalSize: binaryEnvelope1.byteLength,
        numFragments: 2,
      });

      // Create fragments for second envelope (packet ID 2)
      const frag2Part1 = new Fragment({
        packetId: 2,
        fragmentNumber: 1,
        data: binaryEnvelope2.slice(0, Math.ceil(binaryEnvelope2.length / 2)),
        totalSize: binaryEnvelope2.byteLength,
        numFragments: 2,
      });

      // Process first fragments
      const result1 = converter.wireMessageToEnvelope(
        new Signalv2WireMessage({
          message: { case: 'fragment', value: frag1Part1 },
        }),
      );
      expect(result1).toBeNull();

      const result2 = converter.wireMessageToEnvelope(
        new Signalv2WireMessage({
          message: { case: 'fragment', value: frag2Part1 },
        }),
      );
      expect(result2).toBeNull();

      // Complete first envelope
      const frag1Part2 = new Fragment({
        packetId: 1,
        fragmentNumber: 2,
        data: binaryEnvelope1.slice(Math.ceil(binaryEnvelope1.length / 2)),
        totalSize: binaryEnvelope1.byteLength,
        numFragments: 2,
      });

      const result3 = converter.wireMessageToEnvelope(
        new Signalv2WireMessage({
          message: { case: 'fragment', value: frag1Part2 },
        }),
      );
      expect(result3?.clientMessages).toEqual([]);
    });

    it('should return null for wire messages with unknown message case', () => {
      const wireMessage = new Signalv2WireMessage({
        message: {
          case: undefined,
          value: undefined,
        },
      });

      const result = converter.wireMessageToEnvelope(wireMessage);
      expect(result).toBeNull();
    });
  });

  describe('envelopeToWireMessages', () => {
    it('should return single wire message for small envelope', () => {
      const testEnvelope = new Envelope({
        clientMessages: [],
      });

      const wireMessages = converter.envelopeToWireMessages(testEnvelope);

      expect(wireMessages).toHaveLength(1);
      expect(wireMessages[0].message.case).toBe('envelope');
      expect(wireMessages[0].message.value).toBe(testEnvelope);
    });

    it('should fragment large envelope into multiple wire messages', () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Create a large envelope (larger than 16,000 bytes)
      const largeEnvelope = new Envelope({
        clientMessages: [],
      });

      // Override toBinary to return large data
      largeEnvelope.toBinary = vi.fn(() => new Uint8Array(20000).fill(42));

      const wireMessages = converter.envelopeToWireMessages(largeEnvelope);

      expect(wireMessages.length).toBeGreaterThan(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending fragmented envelope'),
      );

      // Verify all wire messages are fragments
      wireMessages.forEach((wireMessage) => {
        expect(wireMessage.message.case).toBe('fragment');
        expect(wireMessage.message.value).toBeInstanceOf(Fragment);
      });

      // Verify fragment properties
      const fragments = wireMessages.map((wm) => wm.message.value as Fragment);
      const totalFragments = fragments.length;

      fragments.forEach((fragment, index) => {
        expect(fragment.packetId).toBe(0);
        expect(fragment.fragmentNumber).toBe(index + 1);
        expect(fragment.numFragments).toBe(totalFragments);
        expect(fragment.totalSize).toBe(20000);
      });

      consoleInfoSpy.mockRestore();
    });

    it('should create fragments that can be reassembled correctly', () => {
      // Create a moderately large envelope that will be fragmented
      const connectRequest = new Signalv2ClientMessage({
        message: {
          case: 'connectRequest',
          value: {
            metadata: new Array(20_000).fill('a').join(''),
          },
        },
      });
      const testEnvelope = new Envelope({
        clientMessages: [connectRequest],
      });

      // Fragment the envelope
      const wireMessages = converter.envelopeToWireMessages(testEnvelope);
      expect(wireMessages.length).toBeGreaterThan(1);
      console.log('wireMessages', wireMessages);
      // Create new converter to test reassembly
      const reassemblyConverter = new WireMessageConverter();

      // Feed fragments back to converter
      let reassembledEnvelope: Envelope | null = null;
      for (const wireMessage of wireMessages) {
        const result = reassemblyConverter.wireMessageToEnvelope(wireMessage);
        if (result !== null) {
          reassembledEnvelope = result;
        }
      }

      expect(reassembledEnvelope).not.toBeNull();
      expect(reassembledEnvelope?.clientMessages).toEqual([connectRequest]);
    });

    it('should handle exactly MAX_WIRE_MESSAGE_SIZE envelope', () => {
      // Create envelope that's exactly under the size limit
      const envelope = new Envelope({
        clientMessages: [],
      });

      const wireMessages = converter.envelopeToWireMessages(envelope);

      // Should be a single message since it's not over the limit
      expect(wireMessages).toHaveLength(1);
      expect(wireMessages[0].message.case).toBe('envelope');
    });

    it('should handle empty envelope', () => {
      const emptyEnvelope = new Envelope({
        clientMessages: [],
      });

      const wireMessages = converter.envelopeToWireMessages(emptyEnvelope);

      expect(wireMessages).toHaveLength(1);
      expect(wireMessages[0].message.case).toBe('envelope');
      expect(wireMessages[0].message.value).toBe(emptyEnvelope);
    });

    it('should create fragments with sequential packet IDs', () => {
      const envelope = new Envelope({
        clientMessages: [],
      });

      // Override toBinary to return large data
      envelope.toBinary = vi.fn(() => new Uint8Array(20000).fill(1));

      const wireMessages = converter.envelopeToWireMessages(envelope);
      const fragments = wireMessages.map((wm) => wm.message.value as Fragment);

      // All fragments should have the same packet ID (0 in this implementation)
      const packetIds = fragments.map((f) => f.packetId);
      expect(new Set(packetIds).size).toBe(1);
      expect(packetIds[0]).toBe(0);
    });
  });

  describe('clearFragmentBuffer', () => {
    it('should clear all buffered fragments', () => {
      // Add some fragments to the buffer
      const fragment = new Fragment({
        packetId: 1,
        fragmentNumber: 1,
        data: new Uint8Array([1, 2, 3]),
        totalSize: 6,
        numFragments: 2,
      });

      const wireMessage = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment },
      });

      // This should buffer the fragment
      converter.wireMessageToEnvelope(wireMessage);

      // Clear the buffer
      converter.clearFragmentBuffer();

      // Adding the second fragment should now return null since buffer was cleared
      const fragment2 = new Fragment({
        packetId: 1,
        fragmentNumber: 2,
        data: new Uint8Array([4, 5, 6]),
        totalSize: 6,
        numFragments: 2,
      });

      const wireMessage2 = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment2 },
      });

      const result = converter.wireMessageToEnvelope(wireMessage2);
      expect(result).toBeNull();
    });

    it('should not affect direct envelope processing', () => {
      const testEnvelope = new Envelope({
        clientMessages: [],
      });

      const wireMessage = new Signalv2WireMessage({
        message: { case: 'envelope', value: testEnvelope },
      });

      converter.clearFragmentBuffer();

      const result = converter.wireMessageToEnvelope(wireMessage);
      expect(result).toBe(testEnvelope);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle fragments with zero data', () => {
      const fragment = new Fragment({
        packetId: 1,
        fragmentNumber: 1,
        data: new Uint8Array(0),
        totalSize: 0,
        numFragments: 1,
      });

      const wireMessage = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragment },
      });

      const result = converter.wireMessageToEnvelope(wireMessage);
      expect(result).not.toBeNull();
    });

    it('should handle very large fragment counts', () => {
      const testEnvelope = new Envelope({
        clientMessages: [],
      });
      const binaryEnvelope = testEnvelope.toBinary();

      // Create many small fragments
      const numFragments = 100;
      const fragmentSize = Math.ceil(binaryEnvelope.length / numFragments);

      const fragments: Fragment[] = [];
      for (let i = 1; i <= numFragments; i++) {
        const start = i * fragmentSize;
        const end = Math.min(start + fragmentSize, binaryEnvelope.length);
        fragments.push(
          new Fragment({
            packetId: 1,
            fragmentNumber: i,
            data: binaryEnvelope.slice(start, end),
            totalSize: binaryEnvelope.byteLength,
            numFragments,
          }),
        );
      }

      // Process all but the last fragment
      for (let i = 0; i < fragments.length - 1; i++) {
        const wireMessage = new Signalv2WireMessage({
          message: { case: 'fragment', value: fragments[i] },
        });
        const result = converter.wireMessageToEnvelope(wireMessage);
        expect(result).toBeNull();
      }

      // Process the last fragment
      const lastWireMessage = new Signalv2WireMessage({
        message: { case: 'fragment', value: fragments[fragments.length - 1] },
      });
      const result = converter.wireMessageToEnvelope(lastWireMessage);
      expect(result).not.toBeNull();
      expect(result?.clientMessages).toEqual([]);
    });
  });
});
