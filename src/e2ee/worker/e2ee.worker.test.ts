import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import type { E2EEWorkerMessage } from '../types';
import { createKeyMaterialFromString } from '../utils';
import { setLocalEncryptionEnabled } from './FrameCryptor';

describe('e2ee worker', () => {
  // Sends a message to the worker, like `worker.postMessage` on the main thread
  const post = (msg: E2EEWorkerMessage) =>
    (globalThis.onmessage as (ev: { data: E2EEWorkerMessage }) => void)({ data: msg });

  beforeAll(async () => {
    // The test runs outside of a worker scope: give the worker a place to post its replies
    globalThis.postMessage = () => {};
    await import('./e2ee.worker');
  });

  afterEach(() => {
    setLocalEncryptionEnabled(undefined);
  });

  it('keeps sender and receiver cryptors with the same track id apart', async () => {
    // Set up the worker with encryption enabled and a key for the local participant
    post({
      kind: 'init',
      data: { keyProviderOptions: { ...KEY_PROVIDER_DEFAULTS, sharedKey: false }, loglevel: 4 },
    });
    post({ kind: 'enable', data: { enabled: true, participantIdentity: 'me', local: true } });
    post({
      kind: 'setKey',
      data: {
        participantIdentity: 'me',
        isPublisher: true,
        key: await createKeyMaterialFromString('key'),
        keyIndex: 0,
        updateCurrentKeyIndex: true,
      },
    });

    // Set up a sender for the local track "mic"
    let senderInput!: ReadableStreamDefaultController<RTCEncodedVideoFrame>;
    const sentFrames: RTCEncodedVideoFrame[] = [];
    post({
      kind: 'encode',
      data: {
        participantIdentity: 'me',
        trackId: 'mic',
        hasPacketTrailer: false,
        readableStream: new ReadableStream({
          start: (controller) => {
            senderInput = controller;
          },
        }),
        writableStream: new WritableStream({
          write: (frame) => {
            sentFrames.push(frame);
          },
        }),
      },
    });

    // Set up a receiver for a remote track that is also called "mic", then remove it
    post({
      kind: 'decode',
      data: {
        participantIdentity: 'remote',
        trackId: 'mic',
        hasPacketTrailer: false,
        readableStream: new ReadableStream(),
        writableStream: new WritableStream(),
      },
    });
    post({ kind: 'removeTransform', data: { participantIdentity: 'remote', trackId: 'mic' } });

    // The worker handles its messages one after the other: wait until it is through
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Send a frame of 16 bytes on the local track
    senderInput.enqueue({
      data: new Uint8Array(16).buffer,
      timestamp: 1,
      type: 'key',
      getMetadata: () => ({}),
    } as RTCEncodedVideoFrame);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The sent frame is longer, because encryption appends the IV and the trailer
    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].data.byteLength).toBeGreaterThan(16);
  });

  it('keeps the encryption state of each received track separate', async () => {
    // Set up the worker. The remote participant "alice" has no key
    post({
      kind: 'init',
      data: { keyProviderOptions: { ...KEY_PROVIDER_DEFAULTS, sharedKey: false }, loglevel: 4 },
    });

    // Set up a receiver for an encrypted track of alice
    let receiverInput!: ReadableStreamDefaultController<RTCEncodedVideoFrame>;
    const decodedFrames: RTCEncodedVideoFrame[] = [];
    post({
      kind: 'decode',
      data: {
        participantIdentity: 'alice',
        trackId: 'alice-mic',
        encrypted: true,
        hasPacketTrailer: false,
        readableStream: new ReadableStream({
          start: (controller) => {
            receiverInput = controller;
          },
        }),
        writableStream: new WritableStream({
          write: (frame) => {
            decodedFrames.push(frame);
          },
        }),
      },
    });

    // Set up a receiver for a second track of alice, which is not encrypted
    post({ kind: 'enable', data: { enabled: false, participantIdentity: 'alice' } });
    post({
      kind: 'decode',
      data: {
        participantIdentity: 'alice',
        trackId: 'alice-screen',
        encrypted: false /* <-- DIFFERENCE */,
        hasPacketTrailer: false,
        readableStream: new ReadableStream(),
        writableStream: new WritableStream(),
      },
    });

    // The worker handles its messages one after the other: wait until it is through
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Receive a frame on the encrypted track
    receiverInput.enqueue({
      data: new Uint8Array(32).buffer,
      timestamp: 1,
      type: 'key',
      getMetadata: () => ({}),
    } as RTCEncodedVideoFrame);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The frame cannot be decrypted without a key, so it does not reach the decoder
    expect(decodedFrames).toStrictEqual([]);
  });
});
