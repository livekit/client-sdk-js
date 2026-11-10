import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import type { E2EEWorkerMessage } from '../types';
import { createKeyMaterialFromString } from '../utils';
import { setLocalEncryptionEnabled } from './FrameCryptor';

function mockFrame(data: Uint8Array): RTCEncodedVideoFrame {
  return {
    data: data.buffer,
    timestamp: 1,
    type: 'key',
    getMetadata: () => ({}),
  } as RTCEncodedVideoFrame;
}

describe('e2ee worker', () => {
  const post = (msg: E2EEWorkerMessage) =>
    (globalThis.onmessage as (ev: { data: E2EEWorkerMessage }) => void)({ data: msg });

  beforeAll(async () => {
    vi.stubGlobal('postMessage', vi.fn());
    await import('./e2ee.worker');
  });

  afterEach(() => {
    setLocalEncryptionEnabled(undefined);
  });

  it('keeps sender and receiver cryptors with the same track id apart', async () => {
    const sent: RTCEncodedVideoFrame[] = [];
    let send: (frame: RTCEncodedVideoFrame) => void = () => {};
    const streams = () => ({
      readableStream: new ReadableStream(),
      writableStream: new WritableStream(),
      hasPacketTrailer: false,
    });

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
    post({
      kind: 'encode',
      data: {
        ...streams(),
        participantIdentity: 'me',
        trackId: 'mic',
        readableStream: new ReadableStream({
          start: (c) => {
            send = (f) => c.enqueue(f);
          },
        }),
        writableStream: new WritableStream({
          write: (f) => {
            sent.push(f);
          },
        }),
      },
    });
    post({ kind: 'enable', data: { enabled: false, participantIdentity: 'me' } });
    post({
      kind: 'decode',
      data: { ...streams(), participantIdentity: 'remote', trackId: 'mic' },
    });
    post({ kind: 'removeTransform', data: { participantIdentity: 'remote', trackId: 'mic' } });

    await vi.waitFor(() => expect(send).not.toBe(undefined));
    const plainLength = 16;
    // let the queued messages run before the frame arrives
    await new Promise((resolve) => setTimeout(resolve, 20));
    send(mockFrame(new Uint8Array(plainLength)));

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].data.byteLength).toBeGreaterThan(plainLength);
  });

  it('keeps the encryption state of each received track separate', async () => {
    const played: RTCEncodedVideoFrame[] = [];
    let receive: (frame: RTCEncodedVideoFrame) => void = () => {};

    post({
      kind: 'init',
      data: { keyProviderOptions: { ...KEY_PROVIDER_DEFAULTS, sharedKey: false }, loglevel: 4 },
    });
    post({
      kind: 'decode',
      data: {
        participantIdentity: 'alice',
        trackId: 'alice-mic',
        encrypted: true,
        hasPacketTrailer: false,
        readableStream: new ReadableStream({
          start: (c) => {
            receive = (f) => c.enqueue(f);
          },
        }),
        writableStream: new WritableStream({
          write: (f) => {
            played.push(f);
          },
        }),
      },
    });
    post({ kind: 'enable', data: { enabled: false, participantIdentity: 'alice' } });
    post({
      kind: 'decode',
      data: {
        participantIdentity: 'alice',
        trackId: 'alice-screen',
        encrypted: false,
        hasPacketTrailer: false,
        readableStream: new ReadableStream(),
        writableStream: new WritableStream(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    // no key for alice: a frame of the encrypted track must not reach the decoder as it is
    receive(mockFrame(new Uint8Array(32)));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(played).toHaveLength(0);
  });
});
