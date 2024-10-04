import { afterEach, describe, expect, it, vitest } from 'vitest';
import { IV_LENGTH, KEY_PROVIDER_DEFAULTS } from '../constants';
import { CryptorEvent } from '../events';
import type { KeyProviderOptions } from '../types';
import { createKeyMaterialFromString } from '../utils';
import { FrameCryptor, encryptionEnabledMap, isFrameServerInjected } from './FrameCryptor';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

function mockRTCEncodedVideoFrame(keyIndex: number): RTCEncodedVideoFrame {
  const trailer = mockFrameTrailer(keyIndex);
  const data = new Uint8Array(trailer.length + 10);
  data.set(trailer, 10);
  return {
    data: data.buffer,
    timestamp: vitest.getMockedSystemTime()?.getTime() ?? 0,
    type: 'key',
    getMetadata(): RTCEncodedVideoFrameMetadata {
      return {};
    },
  };
}

function mockFrameTrailer(keyIndex: number): Uint8Array {
  const frameTrailer = new Uint8Array(2);

  frameTrailer[0] = IV_LENGTH;
  frameTrailer[1] = keyIndex;

  return frameTrailer;
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

function prepareParticipantTestDecoder(
  participantIdentity: string,
  partialKeyProviderOptions: Partial<KeyProviderOptions>,
): {
  keys: ParticipantKeyHandler;
  cryptor: FrameCryptor;
  input: TestUnderlyingSource<RTCEncodedVideoFrame>;
} {
  const keyProviderOptions = { ...KEY_PROVIDER_DEFAULTS, ...partialKeyProviderOptions };
  const keys = new ParticipantKeyHandler(participantIdentity, keyProviderOptions);

  encryptionEnabledMap.set(participantIdentity, true);

  const cryptor = new FrameCryptor({
    participantIdentity,
    keys,
    keyProviderOptions,
    sifTrailer: new Uint8Array(),
  });

  const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
  const writeableStream = new WritableStream();
  cryptor.setupTransform('decode', new ReadableStream(input), writeableStream, 'testTrack');

  return { keys, cryptor, input };
}

describe('FrameCryptor', () => {
  const participantIdentity = 'testParticipant';

  afterEach(() => {
    encryptionEnabledMap.clear();
  });

  it('identifies server injected frame correctly', () => {
    const frameTrailer = new TextEncoder().encode('LKROCKS');
    const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...frameTrailer]).buffer;

    expect(isFrameServerInjected(frameData, frameTrailer)).toBe(true);
  });

  it('identifies server non server injected frame correctly', () => {
    const frameTrailer = new TextEncoder().encode('LKROCKS');
    const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...frameTrailer, 10]);

    expect(isFrameServerInjected(frameData.buffer, frameTrailer)).toBe(false);
    frameData.fill(0);
    expect(isFrameServerInjected(frameData.buffer, frameTrailer)).toBe(false);
  });

  it('marks key invalid after too many failures', async () => {
    const { keys, cryptor, input } = prepareParticipantTestDecoder(participantIdentity, {
      failureTolerance: 1,
    });

    expect(keys.hasValidKey).toBe(true);

    await keys.setKey(await createKeyMaterialFromString('password'), 0);

    vitest.spyOn(keys, 'getKeySet');
    vitest.spyOn(keys, 'decryptionFailure');

    const errorListener = vitest.fn().mockImplementation((e) => {
      console.log('error', e);
    });
    cryptor.on(CryptorEvent.Error, errorListener);

    input.write(mockRTCEncodedVideoFrame(1));

    await vitest.waitFor(() => expect(keys.decryptionFailure).toHaveBeenCalled());
    expect(errorListener).toHaveBeenCalled();
    expect(keys.decryptionFailure).toHaveBeenCalledTimes(1);
    expect(keys.getKeySet).toHaveBeenCalled();
    expect(keys.getKeySet).toHaveBeenLastCalledWith(1);
    expect(keys.hasValidKey).toBe(true);

    vitest.clearAllMocks();

    input.write(mockRTCEncodedVideoFrame(1));

    await vitest.waitFor(() => expect(keys.decryptionFailure).toHaveBeenCalled());
    expect(errorListener).toHaveBeenCalled();
    expect(keys.decryptionFailure).toHaveBeenCalledTimes(1);
    expect(keys.getKeySet).toHaveBeenCalled();
    expect(keys.getKeySet).toHaveBeenLastCalledWith(1);
    expect(keys.hasValidKey).toBe(false);

    vitest.clearAllMocks();

    // this should still fail as keys are all marked as invalid
    input.write(mockRTCEncodedVideoFrame(0));

    await vitest.waitFor(() => expect(keys.getKeySet).toHaveBeenCalled());
    // decryptionFailure() isn't called in this case
    expect(keys.getKeySet).toHaveBeenCalled();
    expect(keys.getKeySet).toHaveBeenLastCalledWith(0);
    expect(keys.hasValidKey).toBe(false);
  });

  it('mark as valid when a new key is set on same index', async () => {
    const { keys, input } = prepareParticipantTestDecoder(participantIdentity, {
      failureTolerance: 0,
    });

    const material = await createKeyMaterialFromString('password');
    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);

    input.write(mockRTCEncodedVideoFrame(1));

    expect(keys.hasValidKey).toBe(false);

    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);
  });

  it('mark as valid when a new key is set on new index', async () => {
    const { keys, input } = prepareParticipantTestDecoder(participantIdentity, {
      failureTolerance: 0,
    });

    const material = await createKeyMaterialFromString('password');
    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);

    input.write(mockRTCEncodedVideoFrame(1));

    expect(keys.hasValidKey).toBe(false);

    await keys.setKey(material, 1);

    expect(keys.hasValidKey).toBe(true);
  });
});
