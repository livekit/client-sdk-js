import { afterEach } from 'node:test';
import { describe, expect, it, vitest } from 'vitest';
import { IV_LENGTH, KEY_PROVIDER_DEFAULTS } from '../constants';
import type { KeyProviderOptions } from '../types';
import { createKeyMaterialFromString } from '../utils';
import { FrameCryptor, encryptionEnabledMap, isFrameServerInjected } from './FrameCryptor';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

function mockRTCEncodedVideoFrame(data: Uint8Array): RTCEncodedVideoFrame {
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

function mockController(): TransformStreamDefaultController {
  return {
    desiredSize: 0,
    enqueue: vitest.fn(),
    error: vitest.fn(),
    terminate: vitest.fn(),
  };
}

function prepareParticipantTest(
  participantIdentity: string,
  partialKeyProviderOptions: Partial<KeyProviderOptions>,
): { keys: ParticipantKeyHandler; cryptor: FrameCryptor } {
  const keyProviderOptions = { ...KEY_PROVIDER_DEFAULTS, ...partialKeyProviderOptions };
  const keys = new ParticipantKeyHandler(participantIdentity, keyProviderOptions);

  encryptionEnabledMap.set(participantIdentity, true);

  const cryptor = new FrameCryptor({
    participantIdentity,
    keys,
    keyProviderOptions,
    sifTrailer: new Uint8Array(),
  });

  return { keys, cryptor };
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
    const { keys, cryptor } = prepareParticipantTest(participantIdentity, { failureTolerance: 1 });

    expect(keys.hasValidKey).toBe(true);

    await keys.setKey(await createKeyMaterialFromString('password'), 0);

    vitest.spyOn(keys, 'getKeySet');
    vitest.spyOn(keys, 'decryptionFailure');

    const controller = mockController();

    // TODO: use mock streams instead
    (cryptor as any).decodeFunction(mockRTCEncodedVideoFrame(mockFrameTrailer(1)), controller);

    expect(keys.decryptionFailure).toHaveBeenCalledTimes(1);
    expect(keys.getKeySet).toHaveBeenCalledTimes(2);
    expect(keys.getKeySet).toHaveBeenLastCalledWith(1);

    expect(keys.hasValidKey).toBe(true);

    (cryptor as any).decodeFunction(mockRTCEncodedVideoFrame(mockFrameTrailer(1)), controller);

    expect(keys.decryptionFailure).toHaveBeenCalledTimes(2);
    expect(keys.getKeySet).toHaveBeenCalledTimes(4);
    expect(keys.getKeySet).toHaveBeenLastCalledWith(1);
    expect(keys.hasValidKey).toBe(false);

    // this should still fail as keys are all marked as invalid
    (cryptor as any).decodeFunction(mockRTCEncodedVideoFrame(mockFrameTrailer(0)), controller);

    // decryptionFailure() isn't called in this case
    expect(keys.decryptionFailure).toHaveBeenCalledTimes(2);
    expect(keys.getKeySet).toHaveBeenLastCalledWith(0);
    expect(keys.hasValidKey).toBe(false);
  });

  it('mark as valid when a new key is set on same index', async () => {
    const { keys, cryptor } = prepareParticipantTest(participantIdentity, { failureTolerance: 0 });

    const material = await createKeyMaterialFromString('password');
    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);

    const controller = mockController();

    // TODO: use mock streams instead
    (cryptor as any).decodeFunction(mockRTCEncodedVideoFrame(mockFrameTrailer(1)), controller);

    expect(keys.hasValidKey).toBe(false);

    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);
  });

  it('mark as valid when a new key is set on new index', async () => {
    const { keys, cryptor } = prepareParticipantTest(participantIdentity, { failureTolerance: 0 });

    const material = await createKeyMaterialFromString('password');
    await keys.setKey(material, 0);

    expect(keys.hasValidKey).toBe(true);

    const controller = mockController();

    // TODO: use mock streams instead
    (cryptor as any).decodeFunction(mockRTCEncodedVideoFrame(mockFrameTrailer(1)), controller);

    expect(keys.hasValidKey).toBe(false);

    await keys.setKey(material, 1);

    expect(keys.hasValidKey).toBe(true);
  });
});
