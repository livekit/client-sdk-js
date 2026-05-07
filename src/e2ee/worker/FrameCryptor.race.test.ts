import { afterEach, beforeEach, describe, expect, it, vitest } from 'vitest';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import type { KeyProviderOptions } from '../types';
import { createKeyMaterialFromString } from '../utils';
import { FrameCryptor, encryptionEnabledMap } from './FrameCryptor';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

function mockRTCEncodedVideoFrame(data: Uint8Array): RTCEncodedVideoFrame {
  return {
    data: data.buffer,
    timestamp: vitest.getMockedSystemTime()?.getTime() ?? 0,
    type: 'key',
    getMetadata(): RTCEncodedVideoFrameMetadata {
      return { synchronizationSource: 12345 };
    },
  };
}

class TestUnderlyingSource<T> implements UnderlyingSource<T> {
  controller: ReadableStreamController<T>;

  start(controller: ReadableStreamController<T>): void {
    this.controller = controller;
  }

  write(chunk: T): void {
    this.controller.enqueue(chunk as any);
  }

  close(): void {
    this.controller.close();
  }
}

class TestUnderlyingSink<T> implements UnderlyingSink<T> {
  public chunks: T[] = [];

  write(chunk: T): void {
    this.chunks.push(chunk);
  }
}

function createCryptor(
  participantIdentity: string,
  partialKeyProviderOptions: Partial<KeyProviderOptions> = {},
) {
  const keyProviderOptions = { ...KEY_PROVIDER_DEFAULTS, ...partialKeyProviderOptions };
  const keys = new ParticipantKeyHandler(participantIdentity, keyProviderOptions);
  encryptionEnabledMap.set(participantIdentity, true);

  const cryptor = new FrameCryptor({
    participantIdentity,
    keys,
    keyProviderOptions,
    sifTrailer: new Uint8Array(),
  });

  return { cryptor, keys };
}

describe('FrameCryptor Race Conditions', () => {
  beforeEach(() => {
    vitest.useFakeTimers();
  });

  afterEach(() => {
    encryptionEnabledMap.clear();
    vitest.useRealTimers();
  });

  describe('Race Condition 1: setupTransform with isReuse does not update trackId', () => {
    it('should update trackId even when returning early on reuse', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      const input1 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output1 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      // First setup with trackId 'track1'
      cryptor.setupTransform(
        'encode',
        new ReadableStream(input1),
        new WritableStream(output1),
        'track1',
        false,
        undefined,
      );

      expect(cryptor.getTrackId()).toBe('track1');

      const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      // Second setup with isReuse=true and different trackId 'track2'
      // This simulates transceiver reuse for a new track
      cryptor.setupTransform(
        'encode',
        new ReadableStream(input2),
        new WritableStream(output2),
        'track2',
        true, // isReuse = true
        undefined,
      );

      // BUG: trackId should be updated to 'track2' but remains 'track1'
      expect(cryptor.getTrackId()).toBe('track2');
    });
  });

  describe('Race Condition 2: setParticipant while transform is active', () => {
    it('should handle participant change while transform is processing frames', async () => {
      const { cryptor, keys: keys1 } = createCryptor('participant1');
      await keys1.setKey(await createKeyMaterialFromString('key1'), 0);

      const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input),
        new WritableStream(output),
        'track1',
        false,
        undefined,
      );

      // Queue and process frame for participant1
      const frame1 = mockRTCEncodedVideoFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      input.write(frame1);

      await vitest.waitFor(() => expect(output.chunks).toHaveLength(1));
      expect(output.chunks).toHaveLength(1);

      // Now switch to participant2 (transceiver reuse scenario)
      const keys2 = new ParticipantKeyHandler('participant2', KEY_PROVIDER_DEFAULTS);
      await keys2.setKey(await createKeyMaterialFromString('key2'), 0);
      encryptionEnabledMap.set('participant2', true);

      cryptor.setParticipant('participant2', keys2);

      // Setup new transform for participant2
      const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input2),
        new WritableStream(output2),
        'track2',
        false,
        undefined,
      );

      // Queue frame for participant2
      const frame2 = mockRTCEncodedVideoFrame(
        new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
      );
      input2.write(frame2);

      await vitest.waitFor(() => expect(output2.chunks).toHaveLength(1));

      // First transform should have processed 1 frame before being aborted
      expect(output.chunks).toHaveLength(1);
      // Second frame should be encrypted with participant2's key
      expect(output2.chunks).toHaveLength(1);
      expect(cryptor.getParticipantIdentity()).toBe('participant2');
      expect(cryptor.getTrackId()).toBe('track2');
    });

    it('should automatically cleanup when setParticipant called with different participant', async () => {
      const { cryptor } = createCryptor('participant1');
      const consoleWarnSpy = vitest.spyOn(console, 'warn').mockImplementation(() => {});

      const keys2 = new ParticipantKeyHandler('participant2', KEY_PROVIDER_DEFAULTS);
      encryptionEnabledMap.set('participant2', true);

      // FIXED: setParticipant now automatically cleans up previous participant
      cryptor.setParticipant('participant2', keys2);

      // The code should log a warning and clean up automatically
      expect(cryptor.getParticipantIdentity()).toBe('participant2');

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Race Condition 3: Multiple setupTransform calls in quick succession', () => {
    it('should handle rapid setupTransform calls and track latest trackId', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      // Setup first transform
      const input1 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output1 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input1),
        new WritableStream(output1),
        'track1',
        false,
        undefined,
      );

      expect(cryptor.getTrackId()).toBe('track1');

      // Immediately setup second transform (simulating rapid changes)
      const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input2),
        new WritableStream(output2),
        'track2',
        false,
        undefined,
      );

      // TrackId should immediately update
      expect(cryptor.getTrackId()).toBe('track2');

      // Write frame to second transform
      const frame = mockRTCEncodedVideoFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      input2.write(frame);

      await vitest.advanceTimersToNextTimerAsync();

      // Verify trackId remains correct
      expect(cryptor.getTrackId()).toBe('track2');
    });
  });

  describe('Race Condition 4: isTransformActive flag management', () => {
    it('should properly manage isTransformActive flag across async operations', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      const input1 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output1 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input1),
        new WritableStream(output1),
        'track1',
        false,
        undefined,
      );

      // Close the first stream to trigger the finally() block
      input1.close();

      // Wait for pipe to complete
      await vitest.waitFor(() => {
        // Create a second transform immediately after the first one completes
        const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
        const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

        // This should create a new transform since isTransformActive should be false
        cryptor.setupTransform(
          'encode',
          new ReadableStream(input2),
          new WritableStream(output2),
          'track2',
          true, // isReuse=true
          undefined,
        );

        // Track ID should be updated
        return cryptor.getTrackId() === 'track2';
      });

      expect(cryptor.getTrackId()).toBe('track2');
    });

    it('should handle race between pipe completion and new setupTransform with isReuse', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      const input1 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output1 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input1),
        new WritableStream(output1),
        'track1',
        false,
        undefined,
      );

      // Immediately call with isReuse=true (simulating quick reuse detection)
      const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input2),
        new WritableStream(output2),
        'track2',
        true, // Should return early
        undefined,
      );

      // Close first stream
      input1.close();

      await vitest.advanceTimersToNextTimerAsync();

      // Now try to setup with isReuse=true again after first pipe completed
      const input3 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output3 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input3),
        new WritableStream(output3),
        'track3',
        true,
        undefined,
      );

      // Write a frame to verify which transform is active
      const frame = mockRTCEncodedVideoFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      input3.write(frame);

      await vitest.advanceTimersToNextTimerAsync();

      // The frame might not be processed if the early return prevented setup
      // This demonstrates the race condition
    });
  });

  describe('Race Condition 5: Participant change during active decryption', () => {
    it('should handle participant switch while frames are being decrypted', async () => {
      const { cryptor, keys: keys1 } = createCryptor('participant1');
      await keys1.setKey(await createKeyMaterialFromString('key1'), 0);

      const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'decode',
        new ReadableStream(input),
        new WritableStream(output),
        'track1',
        false,
        undefined,
      );

      // Create an encrypted frame for participant1
      const frameData = new Uint8Array([
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        254,
        96,
        91,
        111,
        187,
        132,
        31,
        12,
        207,
        136,
        17,
        221,
        233,
        116,
        174,
        6,
        50,
        37,
        214,
        71,
        119,
        196,
        255,
        255,
        255,
        255,
        0,
        0,
        0,
        0,
        255,
        255,
        199,
        51,
        12,
        0, // key index 0
      ]);
      const frame1 = mockRTCEncodedVideoFrame(frameData);

      // Queue frame
      input.write(frame1);

      // Immediately switch participant (simulating transceiver reuse)
      const keys2 = new ParticipantKeyHandler('participant2', KEY_PROVIDER_DEFAULTS);
      await keys2.setKey(await createKeyMaterialFromString('key2'), 0);
      encryptionEnabledMap.set('participant2', true);

      cryptor.setParticipant('participant2', keys2);

      // The queued frame is encrypted with participant1's key but will be decrypted with participant2's key
      await vitest.advanceTimersToNextTimerAsync();

      // Frame should fail to decrypt or use wrong key
      // Depending on implementation, it might be dropped or emit an error
    });
  });

  describe('Race Condition 6: unsetParticipant during active transform', () => {
    it('should handle unsetParticipant while transform is processing', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input),
        new WritableStream(output),
        'track1',
        false,
        undefined,
      );

      // Queue frames
      const frame1 = mockRTCEncodedVideoFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      input.write(frame1);

      // Immediately unset participant (simulating track unsubscription)
      cryptor.unsetParticipant();

      // Queue another frame after unset
      const frame2 = mockRTCEncodedVideoFrame(new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]));
      input.write(frame2);

      await vitest.advanceTimersToNextTimerAsync();

      // Transform might still be processing, but participant is undefined
      expect(cryptor.getParticipantIdentity()).toBeUndefined();

      // Frames might still be processed or might be dropped
      // This tests the race between unset and active processing
    });
  });

  describe('Race Condition 7: Codec update during active transform', () => {
    it('should handle codec changes during active encryption', async () => {
      const { cryptor, keys } = createCryptor('participant1');
      await keys.setKey(await createKeyMaterialFromString('key1'), 0);

      const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'encode',
        new ReadableStream(input),
        new WritableStream(output),
        'track1',
        false,
        'vp8',
      );

      // Queue a frame
      const frame1 = mockRTCEncodedVideoFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      input.write(frame1);

      await vitest.waitFor(() => expect(output.chunks.length).toBe(1));

      // Immediately change codec (simulating simulcast layer switch or codec negotiation change)
      cryptor.setVideoCodec('h264');

      // Queue another frame
      const frame2 = mockRTCEncodedVideoFrame(
        new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
      );
      input.write(frame2);

      await vitest.waitFor(() => expect(output.chunks.length).toBe(2));

      // Both frames should be encrypted, but with potentially different unencrypted byte calculations
      expect(output.chunks.length).toBe(2);
    });
  });

  describe('Integration: Simulating rapid participant switches', () => {
    it('should handle rapid subscribe/unsubscribe/resubscribe scenario', async () => {
      const { cryptor, keys: keys1 } = createCryptor('participant1');
      await keys1.setKey(await createKeyMaterialFromString('key1'), 0);

      // Subscribe to participant1
      const input1 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output1 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'decode',
        new ReadableStream(input1),
        new WritableStream(output1),
        'track1',
        false,
        undefined,
      );

      expect(cryptor.getTrackId()).toBe('track1');
      expect(cryptor.getParticipantIdentity()).toBe('participant1');

      // Unsubscribe
      cryptor.unsetParticipant();

      // Immediately subscribe to participant2 (transceiver reuse)
      const keys2 = new ParticipantKeyHandler('participant2', KEY_PROVIDER_DEFAULTS);
      await keys2.setKey(await createKeyMaterialFromString('key2'), 0);
      encryptionEnabledMap.set('participant2', true);

      cryptor.setParticipant('participant2', keys2);

      const input2 = new TestUnderlyingSource<RTCEncodedVideoFrame>();
      const output2 = new TestUnderlyingSink<RTCEncodedVideoFrame>();

      cryptor.setupTransform(
        'decode',
        new ReadableStream(input2),
        new WritableStream(output2),
        'track2',
        true, // isReuse
        undefined,
      );

      // Track ID should be updated even with isReuse
      expect(cryptor.getTrackId()).toBe('track2');
      expect(cryptor.getParticipantIdentity()).toBe('participant2');
    });
  });
});
